'use strict';

/**
 * api/portfolio.js
 * Returns a combined snapshot: live Alpaca data + persisted state from Sheets.
 * Called by the React dashboard on page load and on a polling interval.
 */

const alpaca  = require('../lib/alpaca');
const sheets  = require('../lib/sheets');
const { checkMarketOpen } = require('../lib/marketHours');
const { annualisedVol, totalReturn, MOMENTUM_DAYS, VOL_DAYS, SAFE_HARBOR } = require('../lib/strategy');

const UNIVERSE = (process.env.ETF_UNIVERSE || 'SPY,QQQ,IWM,EFA,EEM,TLT,IEF,LQD,GLD,GSG,XLK,XLE,XLV,BIL')
  .split(',').map(s => s.trim()).filter(Boolean);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Fetch in parallel to minimise latency
    const [account, positions, rawState, marketStatus, equityHistory] = await Promise.all([
      alpaca.getAccount(),
      alpaca.getPositionsMap(),
      sheets.getState().catch(() => null),
      checkMarketOpen(),
      sheets.getEquityHistory().catch(() => []),
    ]);

    // Default empty state if Sheets has never been written to
    const state = rawState || {};

    const portfolioValue = parseFloat(account.portfolio_value);
    const cash           = parseFloat(account.cash);
    const buyingPower    = parseFloat(account.buying_power);

    // Enrich positions with strategy metadata from state
    const enrichedPositions = Object.entries(positions).map(([sym, pos]) => {
      const statePos = (state.positions || {})[sym] || {};
      return {
        symbol       : sym,
        qty          : parseFloat(pos.qty),
        marketValue  : parseFloat(pos.market_value),
        avgEntryPrice: parseFloat(pos.avg_entry_price),
        currentPrice : parseFloat(pos.current_price),
        unrealizedPL : parseFloat(pos.unrealized_pl),
        unrealizedPct: parseFloat(pos.unrealized_plpc) * 100,
        weight       : parseFloat(pos.market_value) / portfolioValue,
        targetWeight : statePos.weight || null,
        momentum     : statePos.momentum || null,
        vol          : statePos.vol || null,
      };
    });

    // Cash position
    const cashWeight = cash / portfolioValue;

    return res.status(200).json({
      account: {
        portfolioValue,
        cash,
        buyingPower,
        cashWeight,
        equityChange1d: parseFloat(account.equity) - parseFloat(account.last_equity),
        equityChangePct: ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity)) * 100,
      },
      positions     : enrichedPositions,
      market        : marketStatus,
      state: {
        lastRebalance  : state.last_rebalance || null,
        currentDrawdown: state.current_drawdown || 0,
        maxDrawdown    : state.max_drawdown_ever || 0,
        maxEquityEver  : state.max_equity_ever || portfolioValue,
        inSafeHarbor   : !!(state.positions || {})[SAFE_HARBOR],
      },
      equityHistory,
      universe      : UNIVERSE,
      dryRun        : process.env.DRY_RUN !== 'false',
    });

  } catch (err) {
    console.error('[portfolio]', err);
    return res.status(500).json({ error: err.message });
  }
};
