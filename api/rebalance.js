'use strict';

/**
 * api/rebalance.js
 * Vercel serverless function — main rebalance endpoint.
 *
 * Called by GitHub Actions cron (Monday 09:35 ET → UTC 13:35).
 * Protected by x-cron-secret header.
 *
 * Flow:
 *   1. Authenticate request
 *   2. Check market is open
 *   3. Check it's a rebalance day (first trading day of the week)
 *   4. Load state from Google Sheets
 *   5. Fetch historical price data from Alpaca
 *   6. Run Dual Momentum + Vol Targeting strategy
 *   7. Compute required trades (with drift threshold)
 *   8. Cancel any open orders
 *   9. Execute trades via Alpaca
 *  10. Persist updated state to Google Sheets
 *  11. Log equity snapshot to Sheets history tab
 *  12. Send Telegram summary
 */

const alpaca       = require('../lib/alpaca');
const sheets       = require('../lib/sheets');
const telegram     = require('../lib/telegram');
const { assertMarketOpen, isRebalanceDay } = require('../lib/marketHours');
const {
  runStrategy,
  computeTrades,
  needsRebalance,
  updateDrawdown,
  SAFE_HARBOR,
} = require('../lib/strategy');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN   = process.env.DRY_RUN !== 'false'; // default true (paper mode)
const CRON_SEC  = process.env.CRON_SECRET || '';
const UNIVERSE  = (process.env.ETF_UNIVERSE || 'SPY,QQQ,IWM,EFA,EEM,TLT,IEF,LQD,GLD,GSG,XLK,XLE,XLV,BIL')
                    .split(',').map(s => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  // ── Auth ────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (CRON_SEC && req.headers['x-cron-secret'] !== CRON_SEC) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const push = (msg) => { log.push(msg); console.log(msg); };

  try {
    push(`[rebalance] Starting — DRY_RUN=${DRY_RUN} — ${new Date().toISOString()}`);
    push(`[rebalance] Universe (${UNIVERSE.length}): ${UNIVERSE.join(', ')}`);

    // ── 1. Market hours guard ──────────────────────────────────────────────
    let marketStatus;
    try {
      marketStatus = await assertMarketOpen(10); // allow up to 10min before open
      push(`[market] ${marketStatus.message}`);
    } catch (e) {
      if (e.code === 'MARKET_CLOSED') {
        push(`[market] ${e.message} — aborting.`);
        return res.status(200).json({ skipped: true, reason: e.message, log });
      }
      throw e;
    }

    // ── 2. Rebalance day check (weekly rhythm) ─────────────────────────────
    const rebalanceDay = await isRebalanceDay();
    // Allow forcing a rebalance via query param for manual triggers
    const forceRebalance = req.query?.force === 'true';

    if (!rebalanceDay && !forceRebalance) {
      push('[schedule] Not a rebalance day — skipping.');
      return res.status(200).json({ skipped: true, reason: 'Not rebalance day', log });
    }
    push(forceRebalance ? '[schedule] Force rebalance triggered.' : '[schedule] Rebalance day confirmed.');

    // ── 3. Load state from Google Sheets ──────────────────────────────────
    push('[sheets] Loading state...');
    const state = await sheets.getState();
    push(`[sheets] State loaded. Positions in state: ${JSON.stringify(state.positions || {})}`);

    // ── 4. Fetch account + positions from Alpaca ──────────────────────────
    push('[alpaca] Fetching account...');
    const account = await alpaca.getAccount();
    const portfolioValue = parseFloat(account.portfolio_value);
    const cash           = parseFloat(account.cash);
    push(`[alpaca] Portfolio: $${portfolioValue.toFixed(2)} | Cash: $${cash.toFixed(2)}`);

    push('[alpaca] Fetching live positions...');
    const currentPositions = await alpaca.getPositionsMap();
    push(`[alpaca] Open positions: ${Object.keys(currentPositions).join(', ') || 'none'}`);

    // ── 5. Fetch historical price data ────────────────────────────────────
    push('[alpaca] Fetching historical bars...');
    // Fetch extra history to have enough data for momentum + vol calculations
    const HISTORY_DAYS = Math.max(200, parseInt(process.env.MOMENTUM_DAYS || '120') + 30);
    const barsMap = await alpaca.getHistoricalBars(UNIVERSE, HISTORY_DAYS);

    const barCounts = Object.entries(barsMap).map(([s, b]) => `${s}:${b.length}`).join(', ');
    push(`[alpaca] Bars fetched — ${barCounts}`);

    // Warn about symbols with insufficient history
    const insufficientData = UNIVERSE.filter(s => (barsMap[s] || []).length < 30);
    if (insufficientData.length > 0) {
      push(`[strategy] WARNING: Insufficient data for: ${insufficientData.join(', ')}`);
    }

    // ── 6. Run strategy ───────────────────────────────────────────────────
    push('[strategy] Running Dual Momentum + Vol Targeting...');
    const result = runStrategy(barsMap, UNIVERSE, portfolioValue);

    push(`[strategy] Risk-free rate (${SAFE_HARBOR}): ${(result.meta.riskFreeReturn * 100).toFixed(2)}%`);
    push(`[strategy] Eligible ETFs (${result.eligible.length}): ${result.eligible.join(', ') || 'none'}`);
    push(`[strategy] Selected (top ${result.selected.length}): ${result.selected.join(', ') || 'none'}`);
    push(`[strategy] In safe harbor: ${result.inSafeHarbor}`);

    for (const sym of result.selected) {
      const w   = (result.weights[sym] * 100).toFixed(1);
      const $   = result.targetDollars[sym].toFixed(2);
      const vol = (result.meta.vols[sym] * 100).toFixed(1);
      const mom = (result.scores[sym] * 100).toFixed(2);
      push(`[strategy]  → ${sym}: weight=${w}%, target=$${$}, vol=${vol}%, momentum=${mom}%`);
    }

    // ── 7. Compute trades ─────────────────────────────────────────────────
    const { trades, totalDrift } = computeTrades(currentPositions, result.targetDollars, portfolioValue);
    push(`[trades] Total portfolio drift: ${(totalDrift * 100).toFixed(2)}%`);

    if (!needsRebalance(totalDrift) && !forceRebalance) {
      push(`[trades] Drift below threshold — no rebalance needed.`);
      return res.status(200).json({
        skipped: true,
        reason : `Drift ${(totalDrift * 100).toFixed(2)}% below threshold`,
        strategy: result,
        log,
      });
    }

    push(`[trades] ${trades.length} trades to execute:`);
    for (const t of trades) push(`  ${t.action.toUpperCase()} ${t.symbol} $${t.amount.toFixed(2)} — ${t.reason}`);

    // ── 8. Cancel open orders before trading ──────────────────────────────
    if (!DRY_RUN) {
      push('[alpaca] Cancelling open orders...');
      await alpaca.cancelAllOrders();
    }

    // ── 9. Execute trades ─────────────────────────────────────────────────
    const executedTrades = [];
    const failedTrades   = [];

    for (const trade of trades) {
      if (DRY_RUN) {
        push(`[DRY RUN] Would ${trade.action} ${trade.symbol} $${trade.amount.toFixed(2)}`);
        executedTrades.push({ ...trade, status: 'dry_run' });
        continue;
      }

      try {
        let order;
        if (trade.action === 'close') {
          order = await alpaca.closePosition(trade.symbol);
        } else {
          order = await alpaca.placeMarketOrderNotional(trade.symbol, trade.action, trade.amount);
        }
        push(`[alpaca] ✓ ${trade.action.toUpperCase()} ${trade.symbol} $${trade.amount.toFixed(2)} — order ${order.id}`);
        executedTrades.push({ ...trade, orderId: order.id, status: 'submitted' });
      } catch (err) {
        push(`[alpaca] ✗ FAILED ${trade.action} ${trade.symbol}: ${err.message}`);
        failedTrades.push({ ...trade, error: err.message });
      }
    }

    // ── 10. Update + persist state ────────────────────────────────────────
    const updatedState = updateDrawdown(state, portfolioValue);
    updatedState.last_rebalance    = new Date().toISOString();
    updatedState.portfolio_value   = portfolioValue;
    updatedState.positions         = Object.fromEntries(
      result.selected.map(sym => [sym, {
        weight        : result.weights[sym],
        target_dollars: result.targetDollars[sym],
        momentum      : result.scores[sym],
        vol           : result.meta.vols[sym],
      }])
    );
    if (result.inSafeHarbor) {
      updatedState.positions[SAFE_HARBOR] = { weight: 1.0, reason: 'safe_harbor' };
    }

    push('[sheets] Persisting state...');
    await sheets.saveState(updatedState);

    // ── 11. Log equity history ─────────────────────────────────────────────
    try {
      await sheets.appendEquityHistory({
        timestamp     : new Date().toISOString(),
        equity        : portfolioValue,
        cash          : cash,
        drawdown      : updatedState.current_drawdown,
        selected      : result.selected.join(','),
        inSafeHarbor  : result.inSafeHarbor,
      });
      push('[sheets] Equity history logged.');
    } catch (e) {
      push(`[sheets] Warning: equity history log failed — ${e.message}`);
    }

    // ── 12. Telegram notification ─────────────────────────────────────────
    const tradesLine = executedTrades.length > 0
      ? executedTrades.map(t => `• ${t.action.toUpperCase()} ${t.symbol} $${t.amount.toFixed(0)}`).join('\n')
      : '• No trades (drift below threshold)';

    const holdingsLine = result.inSafeHarbor
      ? `🛡 Safe harbor (${SAFE_HARBOR}) — all ETFs below risk-free rate`
      : result.selected.map(sym =>
          `• ${sym} ${(result.weights[sym]*100).toFixed(1)}% (mom: ${(result.scores[sym]*100).toFixed(1)}%)`
        ).join('\n');

    const message = [
      `📊 *ETF Bot — Weekly Rebalance*`,
      `${DRY_RUN ? '🧪 DRY RUN' : '🟢 LIVE'}`,
      ``,
      `💼 Portfolio: $${portfolioValue.toFixed(2)}`,
      `📉 Drawdown: ${(updatedState.current_drawdown * 100).toFixed(2)}% (max: ${(updatedState.max_drawdown_ever * 100).toFixed(2)}%)`,
      ``,
      `🎯 Holdings:`,
      holdingsLine,
      ``,
      `📋 Trades:`,
      tradesLine,
      failedTrades.length > 0 ? `\n⚠️ Failed: ${failedTrades.map(t => t.symbol).join(', ')}` : '',
    ].filter(l => l !== undefined).join('\n');

    try {
      await telegram.sendMessage(message);
      push('[telegram] Alert sent.');
    } catch (e) {
      push(`[telegram] Warning: alert failed — ${e.message}`);
    }

    // ── Response ──────────────────────────────────────────────────────────
    return res.status(200).json({
      success        : true,
      dryRun         : DRY_RUN,
      portfolioValue,
      strategy       : {
        eligible     : result.eligible,
        selected     : result.selected,
        weights      : result.weights,
        inSafeHarbor : result.inSafeHarbor,
        scores       : result.scores,
      },
      trades         : executedTrades,
      failedTrades,
      drawdown       : {
        current : updatedState.current_drawdown,
        max     : updatedState.max_drawdown_ever,
      },
      log,
    });

  } catch (err) {
    console.error('[rebalance] FATAL:', err);
    try {
      await telegram.sendMessage(
        `🚨 *ETF Bot ERROR*\n${err.message}\n\nCheck Vercel logs.`
      );
    } catch (_) { /* silent */ }
    return res.status(500).json({ error: err.message, log });
  }
};
