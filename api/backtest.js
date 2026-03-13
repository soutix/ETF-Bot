'use strict';

/**
 * api/backtest.js
 * Dual Momentum + Vol Targeting backtest engine.
 *
 * Fix v0.3.3: track cash + holdings separately so the uninvested
 * portion (vol targeting keeps weights < 100%) is never lost.
 */

const alpaca = require('../lib/alpaca');
const { totalReturn, annualisedVol, SAFE_HARBOR } = require('../lib/strategy');

const UNIVERSE = (process.env.ETF_UNIVERSE || 'SPY,QQQ,IWM,EFA,EEM,TLT,IEF,LQD,GLD,GSG,XLK,XLE,XLV,BIL')
  .split(',').map(s => s.trim()).filter(Boolean);

const TRADING_DAYS_PER_YEAR = 252;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(v, fallback = 0) {
  return (v != null && isFinite(v)) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Backtest engine
// ---------------------------------------------------------------------------

function runBacktest(barsMap, universe, params) {
  const {
    momentumDays = 120,
    volDays      = 20,
    topK         = 3,
    targetVol    = 0.10,
    maxWeight    = 0.40,
    startCapital = 10000,
    frequency    = 'weekly',
  } = params;

  const safeHarbor       = SAFE_HARBOR;
  const rotationUniverse = universe.filter(s => s !== safeHarbor);

  // Build unified date index from SPY
  const spyBars  = barsMap['SPY'] || barsMap[universe[0]] || [];
  const allDates = spyBars.map(b => b.t.split('T')[0]).sort();

  if (allDates.length < momentumDays + 5) {
    throw new Error(`Insufficient data: need ${momentumDays + 5} bars, have ${allDates.length}`);
  }

  // Price lookup: { SYMBOL: { DATE: closePrice } }
  const priceByDate = {};
  for (const sym of universe) {
    priceByDate[sym] = {};
    for (const bar of (barsMap[sym] || [])) {
      priceByDate[sym][bar.t.split('T')[0]] = bar.c;
    }
  }

  function getPrice(sym, date) {
    if (priceByDate[sym]?.[date]) return priceByDate[sym][date];
    const idx = allDates.indexOf(date);
    for (let i = 1; i <= 5; i++) {
      const d = allDates[idx - i];
      if (d && priceByDate[sym]?.[d]) return priceByDate[sym][d];
    }
    return null;
  }

  function getPriceHistory(sym, date, n) {
    const idx = allDates.indexOf(date);
    if (idx < 0) return [];
    const prices = [];
    for (let i = Math.max(0, idx - n + 1); i <= idx; i++) {
      const p = priceByDate[sym]?.[allDates[i]];
      if (p != null) prices.push(p);
    }
    return prices;
  }

  function isRebalanceDate(date) {
    const idx = allDates.indexOf(date);
    if (idx <= momentumDays) return false;
    if (frequency === 'monthly') {
      return date.slice(0, 7) !== allDates[idx - 1].slice(0, 7);
    }
    // Weekly: first trading day of each ISO week
    const weekOf = d => {
      const s = new Date(d + 'T12:00:00Z');
      s.setUTCDate(s.getUTCDate() - (s.getUTCDay() || 7) + 1);
      return s.toISOString().slice(0, 10);
    };
    return weekOf(date) !== weekOf(allDates[idx - 1]);
  }

  // ── Simulation state ─────────────────────────────────────────────────────
  const equityCurve = [];
  const tradeLog    = [];

  let cash     = startCapital;   // uninvested cash
  let holdings = {};             // { symbol: shares }
  let maxEquity = startCapital;

  // Benchmark: SPY buy-and-hold starting at day momentumDays
  const benchmarkStartPrice = getPrice('SPY', allDates[momentumDays]);
  const benchmarkShares     = benchmarkStartPrice ? startCapital / benchmarkStartPrice : 0;

  // ── Main loop ────────────────────────────────────────────────────────────
  for (let i = momentumDays; i < allDates.length; i++) {
    const date = allDates[i];

    // Mark-to-market: cash + invested positions
    let invested = 0;
    for (const [sym, shares] of Object.entries(holdings)) {
      const p = getPrice(sym, date);
      if (p) invested += shares * p;
    }
    const portfolioValue = cash + invested;

    const benchmarkValue = benchmarkShares
      ? benchmarkShares * safeNum(getPrice('SPY', date), benchmarkStartPrice)
      : startCapital;

    if (portfolioValue > maxEquity) maxEquity = portfolioValue;
    const drawdown = maxEquity > 0 ? (maxEquity - portfolioValue) / maxEquity : 0;

    equityCurve.push({ date, equity: portfolioValue, benchmark: benchmarkValue, drawdown });

    if (!isRebalanceDate(date)) continue;

    // ── Score ETFs ──────────────────────────────────────────────────────
    const bilPrices = getPriceHistory(safeHarbor, date, momentumDays + 1);
    const bilReturn = totalReturn(bilPrices);

    const scores = {};
    const vols   = {};
    for (const sym of rotationUniverse) {
      const prices  = getPriceHistory(sym, date, momentumDays + 1);
      const volPrices = getPriceHistory(sym, date, volDays + 1);
      scores[sym] = totalReturn(prices);
      const v     = annualisedVol(volPrices, volDays);
      vols[sym]   = (v != null && isFinite(v) && v > 0) ? v : 0.15;
    }

    // Absolute momentum filter
    const eligible = rotationUniverse.filter(sym =>
      scores[sym] !== null && (bilReturn === null || scores[sym] > bilReturn)
    );

    // Top-K by relative momentum
    const selected = [...eligible]
      .sort((a, b) => safeNum(scores[b]) - safeNum(scores[a]))
      .slice(0, topK);

    // Compute target weights
    const weights = {};
    if (selected.length === 0) {
      weights[safeHarbor] = 1.0;
      selected.push(safeHarbor);
    } else {
      let totalW = 0;
      for (const sym of selected) {
        const vol = vols[sym] || 0.15;
        const w   = Math.min(targetVol / (vol * Math.sqrt(selected.length)), maxWeight);
        weights[sym] = safeNum(w, 0.10);
        totalW += weights[sym];
      }
      // Cap total exposure at 95%
      if (totalW > 0.95) {
        const scale = 0.95 / totalW;
        for (const sym of selected) weights[sym] *= scale;
      }
    }

    // ── Liquidate all current positions ─────────────────────────────────
    const prevHoldings = { ...holdings };
    for (const [sym, shares] of Object.entries(prevHoldings)) {
      const price = getPrice(sym, date);
      if (price) {
        cash += shares * price;
        if (!selected.includes(sym)) {
          tradeLog.push({ date, action: 'SELL', symbol: sym,
            shares, price, value: shares * price });
        }
      }
    }
    holdings = {};

    // ── Buy new targets ──────────────────────────────────────────────────
    const totalPV = cash; // all liquidated — cash = full portfolio value now
    for (const sym of selected) {
      const price = getPrice(sym, date);
      if (!price || !weights[sym]) continue;
      const targetValue = totalPV * weights[sym];
      if (targetValue < 1) continue;
      const shares = targetValue / price;
      holdings[sym] = shares;
      cash -= targetValue;

      const prevShares = prevHoldings[sym] || 0;
      if (prevShares > 0) {
        // Already held — log the delta only if significant
        if (Math.abs(shares - prevShares) / prevShares > 0.05) {
          tradeLog.push({ date, action: shares > prevShares ? 'BUY' : 'SELL',
            symbol: sym, shares: Math.abs(shares - prevShares),
            price, value: Math.abs(shares - prevShares) * price });
        }
      } else {
        tradeLog.push({ date, action: 'BUY', symbol: sym,
          shares, price, value: targetValue });
      }
    }
    // cash now holds the uninvested remainder (vol targeting buffer)
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  const last        = equityCurve[equityCurve.length - 1];
  const finalEquity = last?.equity    || startCapital;
  const finalBench  = last?.benchmark || startCapital;
  const years       = allDates.length / TRADING_DAYS_PER_YEAR;

  const cagr      = Math.pow(finalEquity / startCapital, 1 / years) - 1;
  const benchCAGR = Math.pow(finalBench  / startCapital, 1 / years) - 1;
  const maxDD     = Math.max(...equityCurve.map(p => p.drawdown));

  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) dailyReturns.push((equityCurve[i].equity - prev) / prev);
  }
  const meanR  = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdR   = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanR) ** 2, 0) / dailyReturns.length);
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;

  return {
    equityCurve,
    tradeLog: tradeLog.slice(-200),
    stats: {
      startCapital,
      finalEquity,
      finalBenchmark : finalBench,
      totalReturn    : (finalEquity - startCapital) / startCapital,
      benchmarkReturn: (finalBench  - startCapital) / startCapital,
      cagr           : safeNum(cagr),
      benchCAGR      : safeNum(benchCAGR),
      maxDrawdown    : safeNum(maxDD),
      sharpe         : safeNum(sharpe),
      totalTrades    : tradeLog.length,
      years          : parseFloat(years.toFixed(2)),
    },
    params: { momentumDays, volDays, topK, targetVol, frequency, startCapital },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query || {};
    const params = {
      momentumDays : parseInt(q.momentumDays  || '120',  10),
      volDays      : parseInt(q.volDays       || '20',   10),
      topK         : parseInt(q.topK          || '3',    10),
      targetVol    : parseFloat(q.targetVol   || '0.10'),
      maxWeight    : parseFloat(q.maxWeight   || '0.40'),
      startCapital : parseFloat(q.startCapital || '10000'),
      frequency    : q.frequency === 'monthly' ? 'monthly' : 'weekly',
    };

    console.log('[backtest] Fetching 5yr history for', UNIVERSE.length, 'symbols...');
    const barsMap = await alpaca.getHistoricalBars(UNIVERSE, 365 * 5);

    console.log('[backtest] Running simulation with params:', params);
    const result = runBacktest(barsMap, UNIVERSE, params);

    console.log(`[backtest] CAGR=${(result.stats.cagr*100).toFixed(2)}% | MaxDD=${(result.stats.maxDrawdown*100).toFixed(2)}% | Sharpe=${result.stats.sharpe.toFixed(2)}`);

    return res.status(200).json(result);

  } catch (err) {
    console.error('[backtest]', err);
    return res.status(500).json({ error: err.message });
  }
};
