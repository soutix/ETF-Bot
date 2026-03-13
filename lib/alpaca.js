'use strict';

/**
 * lib/alpaca.js
 * Alpaca Markets client — market data + order execution
 * Uses Alpaca's REST API v2 directly (no SDK dependency).
 */

const https = require('https');

const APCA_KEY    = process.env.APCA_API_KEY_ID;
const APCA_SECRET = process.env.APCA_API_SECRET_KEY;
const BASE_URL    = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
// Market data always uses the data endpoint regardless of paper/live
const DATA_URL    = 'https://data.alpaca.markets';

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

function request(baseUrl, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url      = new URL(path, baseUrl);
    const bodyStr  = body ? JSON.stringify(body) : null;

    const options = {
      hostname : url.hostname,
      path     : url.pathname + url.search,
      method,
      headers  : {
        'APCA-API-KEY-ID'     : APCA_KEY,
        'APCA-API-SECRET-KEY' : APCA_SECRET,
        'Content-Type'        : 'application/json',
      },
    };

    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(`Alpaca ${method} ${path} → HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Alpaca parse error: ${e.message} — raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/**
 * Returns the Alpaca account object.
 * Useful fields: portfolio_value, cash, buying_power, equity
 */
async function getAccount() {
  return request(BASE_URL, '/v2/account');
}

// ---------------------------------------------------------------------------
// Market Data
// ---------------------------------------------------------------------------

/**
 * Returns the latest bar (OHLCV) for each symbol.
 * @param {string[]} symbols — e.g. ['SPY', 'TLT', 'GLD']
 * @returns {Object} — { SPY: { o, h, l, c, v, t }, ... }
 */
async function getLatestBars(symbols) {
  const path = `/v2/stocks/bars/latest?symbols=${symbols.join(',')}&feed=iex`;
  const data = await request(DATA_URL, path);
  // Normalise to { SYMBOL: { c: closePrice, ... } }
  const result = {};
  for (const [sym, bar] of Object.entries(data.bars || {})) {
    result[sym] = bar;
  }
  return result;
}

/**
 * Returns daily OHLCV bars for multiple symbols over a date range.
 * Alpaca paginates; this function handles it automatically.
 *
 * @param {string[]} symbols
 * @param {number}   days       — how many calendar days back to fetch
 * @returns {Object}            — { SPY: [{t, o, h, l, c, v}, ...], ... }
 */
async function getHistoricalBars(symbols, days = 200) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days - 10); // small buffer for weekends/holidays

  const startStr = start.toISOString().split('T')[0];
  const endStr   = end.toISOString().split('T')[0];

  const result = {};
  for (const sym of symbols) result[sym] = [];

  let nextPageToken = null;
  let page = 0;

  do {
    let path = `/v2/stocks/bars?symbols=${symbols.join(',')}`
             + `&timeframe=1Day`
             + `&start=${startStr}&end=${endStr}`
             + `&limit=1000&adjustment=all`;

    if (nextPageToken) path += `&page_token=${encodeURIComponent(nextPageToken)}`;

    const data = await request(DATA_URL, path);

    for (const [sym, bars] of Object.entries(data.bars || {})) {
      result[sym] = result[sym].concat(bars);
    }

    nextPageToken = data.next_page_token || null;
    page++;
    if (page > 10) break; // safety cap
  } while (nextPageToken);

  // Sort ascending by date and trim to requested number of trading days
  for (const sym of symbols) {
    result[sym].sort((a, b) => new Date(a.t) - new Date(b.t));
    if (result[sym].length > days) {
      result[sym] = result[sym].slice(-days);
    }
  }

  return result;
}

/**
 * Convenience: returns an array of closing prices for a symbol.
 * @param {Object} barsMap — output of getHistoricalBars
 * @param {string} symbol
 * @returns {number[]}     — oldest → newest
 */
function closePrices(barsMap, symbol) {
  return (barsMap[symbol] || []).map(b => b.c);
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/**
 * Returns all open positions.
 * @returns {Object[]} — Alpaca position objects
 */
async function getPositions() {
  return request(BASE_URL, '/v2/positions');
}

/**
 * Returns a map of { SYMBOL: { qty, market_value, avg_entry_price, ... } }
 */
async function getPositionsMap() {
  const positions = await getPositions();
  const map = {};
  for (const p of positions) {
    map[p.symbol] = p;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Places a market order.
 * @param {string} symbol
 * @param {string} side          — 'buy' | 'sell'
 * @param {number} notionalUsd   — dollar amount (fractional shares)
 * @param {string} [timeInForce] — default 'day'
 * @returns {Object}             — Alpaca order object
 */
async function placeMarketOrderNotional(symbol, side, notionalUsd, timeInForce = 'day') {
  if (notionalUsd < 1) throw new Error(`Order too small: $${notionalUsd} for ${symbol}`);

  const body = {
    symbol,
    side,
    type         : 'market',
    time_in_force: timeInForce,
    notional     : notionalUsd.toFixed(2),
  };

  return request(BASE_URL, '/v2/orders', 'POST', body);
}

/**
 * Places a market order by quantity (whole shares).
 * Use this when fractional shares are not available for a symbol.
 */
async function placeMarketOrderQty(symbol, side, qty, timeInForce = 'day') {
  const body = {
    symbol,
    side,
    type         : 'market',
    time_in_force: timeInForce,
    qty          : String(qty),
  };

  return request(BASE_URL, '/v2/orders', 'POST', body);
}

/**
 * Closes (liquidates) an entire position.
 */
async function closePosition(symbol) {
  return request(BASE_URL, `/v2/positions/${symbol}`, 'DELETE');
}

/**
 * Cancels all open orders.
 */
async function cancelAllOrders() {
  return request(BASE_URL, '/v2/orders', 'DELETE');
}

/**
 * Returns open orders.
 */
async function getOpenOrders() {
  return request(BASE_URL, '/v2/orders?status=open&limit=100');
}

// ---------------------------------------------------------------------------
// Calendar / Market hours
// ---------------------------------------------------------------------------

/**
 * Returns Alpaca's market calendar for a date range.
 * Each entry: { date, open, close, session_open, session_close }
 * open/close are "HH:MM" strings in US Eastern time.
 */
async function getCalendar(startDate, endDate) {
  const path = `/v2/calendar?start=${startDate}&end=${endDate}`;
  return request(BASE_URL, path);
}

/**
 * Returns the current clock object from Alpaca.
 * Fields: timestamp, is_open, next_open, next_close
 */
async function getClock() {
  return request(BASE_URL, '/v2/clock');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getAccount,
  getLatestBars,
  getHistoricalBars,
  closePrices,
  getPositions,
  getPositionsMap,
  placeMarketOrderNotional,
  placeMarketOrderQty,
  closePosition,
  cancelAllOrders,
  getOpenOrders,
  getCalendar,
  getClock,
};
