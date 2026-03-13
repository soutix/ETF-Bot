'use strict';

/**
 * lib/sheets.js  (ETF Bot)
 * Google Sheets proxy via Apps Script web app.
 * Handles Apps Script redirects (302) automatically.
 */

const https = require('https');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const SHEET_ID        = process.env.SHEET_ID;

if (!APPS_SCRIPT_URL) console.warn('[sheets] WARNING: APPS_SCRIPT_URL not set');

function httpGet(location) {
  return new Promise((resolve, reject) => {
    const url  = new URL(location);
    const opts = {
      hostname: url.hostname,
      path    : url.pathname + url.search,
      method  : 'GET',
      headers : { 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, (res) => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Sheets parse error: ${data.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function post(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url  = new URL(APPS_SCRIPT_URL);
    const opts = {
      hostname: url.hostname,
      path    : url.pathname + url.search,
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Sheets parse error: ${data.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getState() {
  const res = await post({ action: 'getState', sheetId: SHEET_ID });
  if (res.error) throw new Error(`getState: ${res.error}`);
  return res.state || {};
}

async function saveState(state) {
  const res = await post({ action: 'saveState', sheetId: SHEET_ID, state });
  if (res.error) throw new Error(`saveState: ${res.error}`);
  return res;
}

async function appendEquityHistory(row) {
  const res = await post({ action: 'appendEquityHistory', sheetId: SHEET_ID, row });
  if (res.error) throw new Error(`appendEquityHistory: ${res.error}`);
  return res;
}

async function getEquityHistory() {
  const res = await post({ action: 'getEquityHistory', sheetId: SHEET_ID });
  if (res.error) throw new Error(`getEquityHistory: ${res.error}`);
  return res.rows || [];
}

async function appendTrade(trade) {
  const res = await post({ action: 'appendTrade', sheetId: SHEET_ID, trade });
  if (res.error) throw new Error(`appendTrade: ${res.error}`);
  return res;
}

async function saveUniverseScores(etfs) {
  const res = await post({ action: 'saveUniverseScores', sheetId: SHEET_ID, etfs });
  if (res.error) throw new Error(`saveUniverseScores: ${res.error}`);
  return res;
}

module.exports = {
  getState,
  saveState,
  appendEquityHistory,
  getEquityHistory,
  appendTrade,
  saveUniverseScores,
};
