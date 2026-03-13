'use strict';

/**
 * api/backtest.js
 * Runs a historical simulation of the Dual Momentum strategy.
 *
 * Simulation logic:
 *   - Walk forward day by day (or week by week for performance)
 *   - On each "rebalance date" (first trading day of each week/month),
 *     apply the strategy using only data available up to that point
 *   - Track equity curve, trades, drawdown vs BUY_AND_HOLD (SPY)
 *
 * Query params:
 *   ?momentumDays=120  (default: 120)
 *   ?topK=3            (default: 3)
 *   ?targetVol=0.10    (default: 0.10)
 *   ?startCapital=10000 (default: 10000)
 *   ?frequency=weekly  (weekly | monthly, default: weekly)
 */

const alpaca = require('../lib/alpaca');
const { totalReturn, annualisedVol, SAFE_HARBOR } = require('../lib/strategy');

const UNIVERSE = (process.env.ETF_UNIVERSE || 'SPY,QQQ,IWM,EFA,EEM,TLT,IEF,LQD,GLD,GSG,XLK,XLE,XLV,BIL')
  .split(',').map(s => s.trim()).filter(Boolean);

const TRADING_DAYS_PER_YEAR = 252;

// ---------------------------------------------------------------------------
// Backtest engine
// ---------------------------------------------------------------------------

function runBacktest(barsMap, universe, params) {
  const {
    momentumDays  = 120,
    volDays       = 20,
    topK          = 3,
    targetVol     = 0.10,
    maxWeight     = 0.40,
    startCapital  = 10000,
    frequency     = 'weekly', // 'weekly' | 'monthly'
  } = params;

  const safeHarbor = SAFE_HARBOR;
  const rotationUniverse = universe.filter(s => s !== safeHarbor);

  // Build a unified date index from SPY (our proxy for "market open days")
  const spyBars = barsMap['SPY'] || barsMap[universe[0]] || [];
  const allDates = spyBars.map(b => b.t.split('T')[0]).sort();

  if (allDates.length < momentumDays + 5) {
    throw new Error(`Insufficient data: need ${momentumDays + 5} bars, have ${allDates.length}`);
  }

  // Build price lookup: { SYMBOL: { DATE: closePrice } }
  const priceByDate = {};
  for (const sym of universe) {
    priceByDate[sym] = {};
    for (const bar of (barsMap[sym] || [])) {
      priceByDate[sym][bar.t.split('T')[0]] = bar.c;
    }
  }

  // Helper: get close price on or before a date
  function getPrice(sym, date) {
    if (priceByDate[sym][date]) return priceByDate[sym][date];
    // Walk back up to 5 trading days
    const idx = allDates.indexOf(date);
    for (let i = 1; i <= 5; i++) {
      const d = allDates[idx - i];
      if (d && priceByDate[sym][d]) return priceByDate[sym][d];
    }
    return null;
  }

  // Helper: get array of closes up to (and including) date
  function getPriceHistory(sym, date, n) {
    const idx = allDates.indexOf(date);
    if (idx < 0) return [];
    const prices = [];
    for (let i = Math.max(0, idx - n + 1); i <= idx; i++) {
      const p = priceByDate[sym][allDates[i]];
      if (p != null) prices.push(p);
    }
    return prices;
  }

  // Determine rebalance dates
  function isRebalanceDate(date) {
    const idx = allDates.indexOf(date);
    if (idx < momentumDays) return false; // not enough history yet

    if (frequency === 'monthly') {
      // First trading day of each calendar month
      if (idx === 0) return true;
      const prev = allDates[idx - 1];
      return date.slice(0, 7) !== prev.slice(0, 7);
    } else {
      // First trading day of each ISO week (weekly)
      if (idx === 0) return true;
      const d    = new Date(date + 'T12:00:00Z');
      const prev = new Date(allDates[idx - 1] + 'T12:00:00Z');
      // Different ISO week? (simple check: Monday resets the week)
      const weekOf = d => { const s = new Date(d); s.setUTCDate(s.getUTCDate() - (s.getUTCDay() || 7) + 1); return s.toISOString().slice(0, 10); };
      return weekOf(d) !== weekOf(prev);
    }
  }

  // ── Main simulation loop ────────────────────────────────────────────────
  const equityCurve   = [];   // [{ date, equity, benchmark, drawdown }]
  const tradeLog      = [];   // [{ date, action, symbol, shares, price, value }]

  let capital       = startCapital;
  let maxEquity     = startCapital;
  let holdings      = {}; // { symbol: shares }
  let benchmarkShares = null; // SPY buy-and-hold

  // Buy SPY on day 0 for benchmark
  const day0Price = getPrice('SPY', allDates[momentumDays]);
  if (day0Price) benchmarkShares = startCapital / day0Price;

  for (let i = momentumDays; i < allDates.length; i++) {
    const date = allDates[i];

    // ── Mark-to-market ──────────────────────────────────────────────────
    let portfolioValue = 0;
    for (const [sym, shares] of Object.entries(holdings)) {
      const p = getPrice(sym, date);
      if (p) portfolioValue += shares * p;
    }
    if (Object.keys(holdings).length === 0) portfolioValue = capital;

    const benchmarkValue = benchmarkShares
      ? benchmarkShares * (getPrice('SPY', date) || day0Price)
      : startCapital;

    if (portfolioValue > maxEquity) maxEquity = portfolioValue;
    const drawdown = (maxEquity - portfolioValue) / maxEquity;

    equityCurve.push({ date, equity: portfolioValue, benchmark: benchmarkValue, drawdown });

    // ── Rebalance ────────────────────────────────────────────────────────
    if (!isRebalanceDate(date)) continue;

    // Score ETFs
    const bilPrices  = getPriceHistory(safeHarbor, date, momentumDays + 1);
    const bilReturn  = totalReturn(bilPrices);

    const scores = {};
    const vols   = {};
    for (const sym of rotationUniverse) {
      const prices = getPriceHistory(sym, date, momentumDays + 1);
      scores[sym]  = totalReturn(prices);
      vols[sym]    = annualisedVol(getPriceHistory(sym, date, volDays + 1), volDays);
    }

    // Absolute momentum filter
    const eligible = rotationUniverse.filter(sym =>
      scores[sym] !== null && (bilReturn === null || scores[sym] > bilReturn)
    );

    // Top-K by relative momentum
    const selected = [...eligible]
      .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))
      .slice(0, topK);

    // Compute weights
    const weights = {};
    if (selected.length === 0) {
      weights[safeHarbor] = 1.0;
      selected.push(safeHarbor);
    } else {
      let totalW = 0;
      for (const sym of selected) {
        const vol = vols[sym] || 0.15;
        const w   = Math.min(targetVol / (vol * selected.length), maxWeight);
        weights[sym] = w;
        totalW += w;
      }
      if (totalW > 0.95) {
        const scale = 0.95 / totalW;
        for (const sym of selected) weights[sym] *= scale;
      }
    }

    // Execute rebalance: sell everything, buy targets
    const prevHoldings = { ...holdings };
    holdings = {};
    capital  = portfolioValue; // reset to cash

    for (const sym of selected) {
      const price = getPrice(sym, date);
      if (!price) continue;
      const targetValue = capital * (weights[sym] || 0);
      const shares      = targetValue / price;
      holdings[sym]     = shares;

      // Log sells
      if (prevHoldings[sym]) {
        const prevShares = prevHoldings[sym];
        if (Math.abs(shares - prevShares) / prevShares > 0.05) {
          tradeLog.push({ date, action: shares > prevShares ? 'BUY' : 'SELL',
            symbol: sym, shares: Math.abs(shares - prevShares), price, value: Math.abs(shares - prevShares) * price });
        }
      } else {
        tradeLog.push({ date, action: 'BUY', symbol: sym, shares, price, value: shares * price });
      }
    }

    // Log closed positions
    for (const sym of Object.keys(prevHoldings)) {
      if (!holdings[sym]) {
        const price = getPrice(sym, date) || 0;
        tradeLog.push({ date, action: 'SELL', symbol: sym,
          shares: prevHoldings[sym], price, value: prevHoldings[sym] * price });
      }
    }
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  const finalEquity    = equityCurve[equityCurve.length - 1]?.equity    || startCapital;
  const finalBenchmark = equityCurve[equityCurve.length - 1]?.benchmark || startCapital;
  const years          = allDates.length / TRADING_DAYS_PER_YEAR;

  const cagr      = Math.pow(finalEquity / startCapital, 1 / years) - 1;
  const benchCAGR = Math.pow(finalBenchmark / startCapital, 1 / years) - 1;
  const maxDD     = Math.max(...equityCurve.map(p => p.drawdown));

  // Sharpe (simplified, using daily returns)
  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].equity - equityCurve[i-1].equity) / equityCurve[i-1].equity);
  }
  const meanDailyRet  = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdDailyRet   = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanDailyRet) ** 2, 0) / dailyReturns.length);
  const sharpe        = stdDailyRet > 0 ? (meanDailyRet / stdDailyRet) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;

  return {
    equityCurve,
    tradeLog: tradeLog.slice(-200), // last 200 trades
    stats: {
      startCapital,
      finalEquity,
      finalBenchmark,
      totalReturn    : (finalEquity - startCapital) / startCapital,
      benchmarkReturn: (finalBenchmark - startCapital) / startCapital,
      cagr,
      benchCAGR,
      maxDrawdown    : maxDD,
      sharpe         : sharpe,
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
      momentumDays : parseInt(q.momentumDays || '120', 10),
      volDays      : parseInt(q.volDays      || '20',  10),
      topK         : parseInt(q.topK         || '3',   10),
      targetVol    : parseFloat(q.targetVol  || '0.10'),
      maxWeight    : parseFloat(q.maxWeight  || '0.40'),
      startCapital : parseFloat(q.startCapital || '10000'),
      frequency    : q.frequency === 'monthly' ? 'monthly' : 'weekly',
    };

    // Fetch ~5 years of history (max Alpaca allows on IEX feed = ~5 years)
    console.log('[backtest] Fetching 5yr history for', UNIVERSE.length, 'symbols...');
    const barsMap = await alpaca.getHistoricalBars(UNIVERSE, 365 * 5);

    console.log('[backtest] Running simulation with params:', params);
    const result = runBacktest(barsMap, UNIVERSE, params);

    console.log(`[backtest] Done. CAGR=${(result.stats.cagr*100).toFixed(2)}% | MaxDD=${(result.stats.maxDrawdown*100).toFixed(2)}% | Sharpe=${result.stats.sharpe.toFixed(2)}`);

    return res.status(200).json(result);

  } catch (err) {
    console.error('[backtest]', err);
    return res.status(500).json({ error: err.message });
  }
};
