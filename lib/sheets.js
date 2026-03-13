// lib/sheets.js — CommonJS

function getUrl() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error('APPS_SCRIPT_URL env var is not set');
  return url;
}

async function sheetsGET(action, params = {}) {
  const url = new URL(getUrl());
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheets GET ${action} failed: HTTP ${res.status}`);
  return res.json();
}

async function sheetsPOST(action, payload) {
  const res = await fetch(getUrl(), {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error(`Sheets POST ${action} failed: HTTP ${res.status}`);
  return res.json();
}

async function getState() {
  try {
    const data  = await sheetsGET('getState');
    const state = data.state || null;
    if (!state || Object.keys(state).length === 0) return null;
    return state;
  } catch (e) { console.error('[sheets] getState:', e.message); return null; }
}

async function setState(state) { return sheetsPOST('setState', { state }); }

async function updateDashboard(state, signals) {
  const prices   = {};
  signals.forEach(s => { prices[s.asset] = s.price; });
  const invested = Object.entries(state.positions || {}).reduce((sum, [asset, pos]) =>
    sum + pos.units * (prices[asset] || pos.avg_price || 0), 0);
  const equity   = (state.cash_usd || 0) + invested;
  const pnl      = equity - (state.start_cash || 500);
  const top      = signals.find(s => s.selected);
  const topPos   = top ? state.positions?.[top.asset] : null;
  return sheetsPOST('updateDashboard', {
    total_equity: equity, cash_usd: state.cash_usd, invested,
    cash_pct: equity > 0 ? (state.cash_usd / equity * 100).toFixed(2) : 0,
    invested_pct: equity > 0 ? (invested / equity * 100).toFixed(2) : 0,
    pnl, pnl_pct: ((state.start_cash||500) > 0 ? (pnl/(state.start_cash||500)*100) : 0).toFixed(2),
    cumulative_fees: state.cumulative_fees || 0,
    max_drawdown: state.max_drawdown_ever || 0,
    last_rebalance: state.last_rebalance_timestamp || '—',
    next_rebalance: '(on signal change)',
    bot_status: 'RUNNING', mode: state.dry_run ? 'DRY RUN' : 'LIVE',
    active_asset: top?.asset || 'CASH',
    asset_units: topPos?.units || 0, asset_price: top?.price || 0,
    asset_value: topPos ? topPos.units * (top?.price || topPos.avg_price || 0) : 0,
  });
}

async function appendEquityHistory(entry) {
  return sheetsPOST('appendEquityHistory', entry);
}

async function getEquityHistory(limit = 200) {
  try { return (await sheetsGET('getEquityHistory', { limit })).history || []; }
  catch (e) { console.error('[sheets] getEquityHistory:', e.message); return []; }
}

async function appendTrade(trade) { return sheetsPOST('appendTrade', trade); }

async function getTrades(limit = 100) {
  try { return (await sheetsGET('getTrades', { limit })).trades || []; }
  catch (e) { console.error('[sheets] getTrades:', e.message); return []; }
}

async function appendSignals(signals, timestamp) {
  return sheetsPOST('appendSignals', { signals, timestamp });
}

async function getSignals() {
  try { return (await sheetsGET('getSignals')).signals || []; }
  catch (e) { console.error('[sheets] getSignals:', e.message); return []; }
}

async function appendLog(entry) {
  try {
    return await sheetsPOST('appendLog', {
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      level: entry.level || 'INFO', message: entry.message,
      source: entry.source || 'api/rebalance', run_id: entry.run_id || '',
    });
  } catch (e) { console.error('[sheets] appendLog:', e.message); }
}

async function getLogs(limit = 100) {
  try { return (await sheetsGET('getLogs', { limit })).logs || []; }
  catch (e) { console.error('[sheets] getLogs:', e.message); return []; }
}

module.exports = {
  getState, setState, updateDashboard,
  appendEquityHistory, getEquityHistory,
  appendTrade, getTrades,
  appendSignals, getSignals,
  appendLog, getLogs,
};
