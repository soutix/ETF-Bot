'use strict';

/**
 * lib/sheets.js  (ETF Bot)
 * Google Sheets proxy via Apps Script web app.
 *
 * Tabs used:
 *   - "State"          : key-value store for bot state
 *   - "Equity History" : append-only equity snapshots
 *   - "Trade Log"      : append-only trade records
 *   - "Universe Scores": written on each rebalance (overwrite)
 */

const https = require('https');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const SHEET_ID        = process.env.SHEET_ID;

if (!APPS_SCRIPT_URL) console.warn('[sheets] WARNING: APPS_SCRIPT_URL not set');

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
function post(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url  = new URL(APPS_SCRIPT_URL);
    const opts = {
      hostname: url.hostname,
      path    : url.pathname + url.search,
      method  : 'POST',
      headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Sheets parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// State  (tab: "State")
// ---------------------------------------------------------------------------

/**
 * Reads the full bot state.
 * Returns an object with all persisted fields, or {} if empty.
 */
async function getState() {
  const res = await post({ action: 'getState', sheetId: SHEET_ID });
  if (res.error) throw new Error(`getState: ${res.error}`);
  return res.state || {};
}

/**
 * Persists the full bot state (overwrites existing values).
 * @param {Object} state
 */
async function saveState(state) {
  const res = await post({ action: 'saveState', sheetId: SHEET_ID, state });
  if (res.error) throw new Error(`saveState: ${res.error}`);
  return res;
}

// ---------------------------------------------------------------------------
// Equity History  (tab: "Equity History")
// ---------------------------------------------------------------------------

/**
 * Appends one equity snapshot row.
 * @param {{ timestamp, equity, cash, drawdown, selected, inSafeHarbor }} row
 */
async function appendEquityHistory(row) {
  const res = await post({ action: 'appendEquityHistory', sheetId: SHEET_ID, row });
  if (res.error) throw new Error(`appendEquityHistory: ${res.error}`);
  return res;
}

/**
 * Returns all equity history rows as an array of objects.
 */
async function getEquityHistory() {
  const res = await post({ action: 'getEquityHistory', sheetId: SHEET_ID });
  if (res.error) throw new Error(`getEquityHistory: ${res.error}`);
  return res.rows || [];
}

// ---------------------------------------------------------------------------
// Trade Log  (tab: "Trade Log")
// ---------------------------------------------------------------------------

/**
 * Appends one trade record.
 * @param {{ timestamp, symbol, action, amount, orderId, status, reason }} trade
 */
async function appendTrade(trade) {
  const res = await post({ action: 'appendTrade', sheetId: SHEET_ID, trade });
  if (res.error) throw new Error(`appendTrade: ${res.error}`);
  return res;
}

// ---------------------------------------------------------------------------
// Universe Scores  (tab: "Universe Scores")
// ---------------------------------------------------------------------------

/**
 * Overwrites the Universe Scores tab with fresh scores from the last rebalance.
 * @param {Array} etfs — array of ETF score objects from api/universe.js
 */
async function saveUniverseScores(etfs) {
  const res = await post({ action: 'saveUniverseScores', sheetId: SHEET_ID, etfs });
  if (res.error) throw new Error(`saveUniverseScores: ${res.error}`);
  return res;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  getState,
  saveState,
  appendEquityHistory,
  getEquityHistory,
  appendTrade,
  saveUniverseScores,
};
