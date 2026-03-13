'use strict';

/**
 * lib/strategy.js
 * Dual Momentum + Volatility Targeting strategy for ETFs.
 *
 * Algorithm (Gary Antonacci — "Dual Momentum Investing"):
 *
 *   1. ABSOLUTE MOMENTUM (Trend filter)
 *      For each ETF, compute its total return over MOMENTUM_DAYS trading days.
 *      Compare to the risk-free rate (BIL return over the same period).
 *      → ETFs with return ≤ BIL are INELIGIBLE (capital goes to safe harbor).
 *
 *   2. RELATIVE MOMENTUM (Rotation)
 *      Rank eligible ETFs by their momentum score.
 *      Select the top TOP_K.
 *
 *   3. VOLATILITY TARGETING
 *      For each selected ETF, size the position so that its contribution to
 *      portfolio volatility matches TARGET_VOL / TOP_K.
 *      position_weight = (TARGET_VOL / annualised_vol) / TOP_K
 *      Capped at MAX_POSITION_WEIGHT to avoid concentration.
 *
 *   4. REBALANCE THRESHOLD
 *      Skip rebalance if portfolio drift < REBALANCE_THRESHOLD (5%).
 *      Avoids unnecessary churn.
 */

// ---------------------------------------------------------------------------
// Config (can be overridden via env vars)
// ---------------------------------------------------------------------------

const MOMENTUM_DAYS       = parseInt(process.env.MOMENTUM_DAYS       || '120', 10); // ~6 months
const VOL_DAYS            = parseInt(process.env.VOL_DAYS             || '20',  10); // ~1 month
const TOP_K               = parseInt(process.env.TOP_K                || '3',   10);
const TARGET_VOL          = parseFloat(process.env.TARGET_VOL         || '0.10');   // 10% annual
const MAX_GROSS_EXPOSURE  = parseFloat(process.env.MAX_GROSS_EXPOSURE || '0.95');
const MAX_POSITION_WEIGHT = parseFloat(process.env.MAX_POSITION_WEIGHT || '0.40');  // 40% per ETF
const REBALANCE_THRESHOLD = parseFloat(process.env.REBALANCE_THRESHOLD || '0.05');  // 5% drift
const SAFE_HARBOR         = process.env.SAFE_HARBOR || 'BIL';
const TRADING_DAYS_PER_YEAR = 252;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/**
 * Total return of a price series (oldest → newest).
 * @param {number[]} prices
 * @param {number}   lookback — number of bars back (default: full series)
 */
function totalReturn(prices, lookback) {
  if (!prices || prices.length < 2) return null;
  const slice = lookback ? prices.slice(-lookback - 1) : prices;
  if (slice.length < 2) return null;
  return (slice[slice.length - 1] / slice[0]) - 1;
}

/**
 * Annualised volatility of daily returns.
 * @param {number[]} prices  — close prices, oldest first
 * @param {number}   lookback
 */
function annualisedVol(prices, lookback = VOL_DAYS) {
  const slice = prices.slice(-lookback - 1);
  if (slice.length < 3) return null;

  const returns = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * TRADING_DAYS_PER_YEAR);
}

/**
 * Compute position weight via volatility targeting.
 * weight = (TARGET_VOL / asset_vol) / TOP_K
 * Capped at MAX_POSITION_WEIGHT.
 */
function volTargetWeight(assetVol, nPositions) {
  if (!assetVol || assetVol <= 0) return 1 / nPositions; // fallback equal weight
  const rawWeight = TARGET_VOL / (assetVol * nPositions);
  return Math.min(rawWeight, MAX_POSITION_WEIGHT);
}

// ---------------------------------------------------------------------------
// Core strategy
// ---------------------------------------------------------------------------

/**
 * Run the full strategy given historical price data.
 *
 * @param {Object} barsMap      — { SYMBOL: [{t, c, ...}] } from alpaca.getHistoricalBars
 * @param {string[]} universe   — list of all ETF tickers
 * @param {number}  portfolioValue — total portfolio value in USD
 *
 * @returns {Object} result containing:
 *   - scores        {SYMBOL: number}  — momentum scores for all ETFs
 *   - eligible      string[]          — ETFs passing absolute momentum filter
 *   - selected      string[]          — top-K selected ETFs
 *   - weights       {SYMBOL: number}  — target portfolio weights (0→1)
 *   - targetDollars {SYMBOL: number}  — target notional value per ETF
 *   - safeHarborPct number            — pct of portfolio in safe harbor
 *   - inSafeHarbor  boolean           — true if no ETFs eligible
 *   - meta          Object            — detailed diagnostics
 */
function runStrategy(barsMap, universe, portfolioValue) {
  const meta = { scores: {}, vols: {}, absoluteFilter: {} };

  // ── 1. Get risk-free benchmark return (BIL) ────────────────────────────
  const bilPrices      = (barsMap[SAFE_HARBOR] || []).map(b => b.c);
  const bilReturn      = totalReturn(bilPrices, MOMENTUM_DAYS);
  meta.riskFreeReturn  = bilReturn;

  // ── 2. Score all ETFs (exclude safe harbor from rotation universe) ──────
  const rotationUniverse = universe.filter(s => s !== SAFE_HARBOR);

  for (const sym of rotationUniverse) {
    const prices  = (barsMap[sym] || []).map(b => b.c);
    const ret     = totalReturn(prices, MOMENTUM_DAYS);
    const vol     = annualisedVol(prices, VOL_DAYS);
    meta.scores[sym] = ret;
    meta.vols[sym]   = vol;

    // Absolute momentum filter: ETF return must beat the risk-free rate
    const passes = ret !== null && (bilReturn === null || ret > bilReturn);
    meta.absoluteFilter[sym] = { ret, passes };
  }

  // ── 3. Filter eligible ETFs ─────────────────────────────────────────────
  const eligible = rotationUniverse.filter(s => meta.absoluteFilter[s]?.passes);

  // ── 4. Rank by momentum score, pick top K ───────────────────────────────
  const ranked  = [...eligible].sort((a, b) => meta.scores[b] - meta.scores[a]);
  const selected = ranked.slice(0, TOP_K);
  const inSafeHarbor = selected.length === 0;

  // ── 5. Compute volatility-targeted weights ───────────────────────────────
  const weights = {};
  let totalWeight = 0;

  if (inSafeHarbor) {
    // Everything in safe harbor
    weights[SAFE_HARBOR] = 1.0;
    totalWeight = 1.0;
  } else {
    for (const sym of selected) {
      const vol = meta.vols[sym];
      const w   = volTargetWeight(vol, selected.length);
      weights[sym] = w;
      totalWeight += w;
    }

    // Scale down to MAX_GROSS_EXPOSURE if total exceeds it
    if (totalWeight > MAX_GROSS_EXPOSURE) {
      const scale = MAX_GROSS_EXPOSURE / totalWeight;
      for (const sym of selected) weights[sym] *= scale;
      totalWeight = MAX_GROSS_EXPOSURE;
    }
  }

  // Residual cash (unallocated)
  const cashWeight = Math.max(0, 1 - totalWeight);

  // ── 6. Compute target dollar amounts ────────────────────────────────────
  const targetDollars = {};
  for (const [sym, w] of Object.entries(weights)) {
    targetDollars[sym] = portfolioValue * w;
  }

  return {
    scores       : meta.scores,
    eligible,
    selected,
    weights,
    targetDollars,
    safeHarborPct: inSafeHarbor ? 1 : cashWeight,
    inSafeHarbor,
    meta         : {
      ...meta,
      totalWeight,
      cashWeight,
      config: { MOMENTUM_DAYS, VOL_DAYS, TOP_K, TARGET_VOL, MAX_GROSS_EXPOSURE, SAFE_HARBOR },
    },
  };
}

// ---------------------------------------------------------------------------
// Rebalance diff — what trades need to happen?
// ---------------------------------------------------------------------------

/**
 * Computes required trades to move from current positions to target weights.
 *
 * @param {Object} currentPositions — { SYMBOL: { market_value: string } } from Alpaca
 * @param {Object} targetDollars    — { SYMBOL: number } from runStrategy
 * @param {number} portfolioValue
 *
 * @returns {Object[]} trades — [{ symbol, action: 'buy'|'sell'|'close', amount, reason }]
 */
function computeTrades(currentPositions, targetDollars, portfolioValue) {
  const trades = [];
  const allSymbols = new Set([
    ...Object.keys(currentPositions),
    ...Object.keys(targetDollars),
  ]);

  let totalDrift = 0;

  for (const sym of allSymbols) {
    const currentValue = parseFloat(currentPositions[sym]?.market_value || 0);
    const targetValue  = targetDollars[sym] || 0;
    const delta        = targetValue - currentValue;
    const driftPct     = Math.abs(delta) / portfolioValue;
    totalDrift         += driftPct;

    if (driftPct < 0.005) continue; // ignore tiny drifts < 0.5%

    if (targetValue === 0 && currentValue > 0) {
      trades.push({ symbol: sym, action: 'close', amount: currentValue,
                    reason: 'Not in target universe' });
    } else if (delta > 0) {
      trades.push({ symbol: sym, action: 'buy',  amount: delta,
                    reason: `Underweight by $${delta.toFixed(2)}` });
    } else if (delta < 0) {
      trades.push({ symbol: sym, action: 'sell', amount: Math.abs(delta),
                    reason: `Overweight by $${Math.abs(delta).toFixed(2)}` });
    }
  }

  // Sort: closes first, then sells, then buys (free up cash before deploying it)
  const order = { close: 0, sell: 1, buy: 2 };
  trades.sort((a, b) => order[a.action] - order[b.action]);

  return { trades, totalDrift };
}

/**
 * Returns true if the portfolio drift exceeds the rebalance threshold.
 * If drift is small, we skip rebalancing to reduce transaction costs.
 */
function needsRebalance(totalDrift) {
  return totalDrift >= REBALANCE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Drawdown tracking
// ---------------------------------------------------------------------------

/**
 * Updates drawdown fields given current equity.
 * @param {Object} state  — the persisted state object from Google Sheets
 * @param {number} equity — current portfolio value
 */
function updateDrawdown(state, equity) {
  if (!state.max_equity_ever || equity > state.max_equity_ever) {
    state.max_equity_ever = equity;
  }
  state.current_drawdown = (state.max_equity_ever - equity) / state.max_equity_ever;
  if (!state.max_drawdown_ever || state.current_drawdown > state.max_drawdown_ever) {
    state.max_drawdown_ever = state.current_drawdown;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  runStrategy,
  computeTrades,
  needsRebalance,
  updateDrawdown,
  totalReturn,
  annualisedVol,
  // Constants (useful for diagnostics)
  MOMENTUM_DAYS,
  VOL_DAYS,
  TOP_K,
  TARGET_VOL,
  SAFE_HARBOR,
  REBALANCE_THRESHOLD,
};
