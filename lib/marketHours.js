'use strict';

/**
 * lib/marketHours.js
 * NYSE market hours guard.
 *
 * Uses Alpaca's /v2/clock endpoint as the source of truth — it accounts for
 * early closes (Black Friday, Christmas Eve, etc.) and all US market holidays
 * automatically, so we never need to maintain our own holiday list.
 */

const { getClock, getCalendar } = require('./alpaca');

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Returns true if the NYSE is currently open (or will open within the next
 * `withinMinutes` minutes — useful to allow the cron to trigger slightly
 * before the open without being blocked).
 *
 * @param {number} withinMinutes — tolerance window before open (default 0)
 * @returns {Promise<{ isOpen: boolean, nextOpen: string, nextClose: string, message: string }>}
 */
async function checkMarketOpen(withinMinutes = 5) {
  const clock = await getClock();

  const now      = new Date(clock.timestamp);
  const nextOpen = new Date(clock.next_open);
  const minutesToOpen = (nextOpen - now) / 60000;

  const isOpen = clock.is_open || minutesToOpen <= withinMinutes;

  return {
    isOpen,
    nextOpen  : clock.next_open,
    nextClose : clock.next_close,
    isOpenNow : clock.is_open,
    message   : clock.is_open
      ? `Market is open. Closes at ${clock.next_close}.`
      : `Market is closed. Opens at ${clock.next_open} (in ${Math.round(minutesToOpen)} min).`,
  };
}

// ---------------------------------------------------------------------------
// Trading day helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's trading session (open/close times in ET) or null if today
 * is not a trading day.
 *
 * @returns {Promise<{ date: string, open: string, close: string } | null>}
 */
async function getTodaySession() {
  const today = new Date().toISOString().split('T')[0];
  const calendar = await getCalendar(today, today);
  return calendar.length > 0 ? calendar[0] : null;
}

/**
 * Returns the last N trading days (calendar entries) ending today.
 * Useful to know "is today a rebalance day" (e.g. Monday = first trading
 * day of the week).
 *
 * @param {number} n
 * @returns {Promise<Array>}
 */
async function getLastNTradingDays(n = 5) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n * 2)); // buffer for weekends
  return getCalendar(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
}

// ---------------------------------------------------------------------------
// Rebalance scheduling logic
// ---------------------------------------------------------------------------

/**
 * Returns true if today should trigger a full rebalance.
 *
 * Strategy: rebalance once per week on the first trading day of the week
 * (typically Monday, but Tuesday if Monday is a holiday).
 *
 * @returns {Promise<boolean>}
 */
async function isRebalanceDay() {
  const session = await getTodaySession();
  if (!session) return false; // not a trading day

  const today = new Date().toISOString().split('T')[0];

  // Get the last 7 calendar days to find the first trading day of the week
  const end   = today;
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const days = await getCalendar(start.toISOString().split('T')[0], end);

  if (days.length === 0) return false;

  // Walk backwards: is today the first trading day in its ISO week?
  const todayDate  = new Date(today + 'T12:00:00Z');
  const dayOfWeek  = todayDate.getUTCDay(); // 0=Sun, 1=Mon, …, 5=Fri

  // Find the most recent Monday (or earlier) in the trading calendar
  // If today is the earliest trading day that falls in this Monday–Sunday week, it's rebalance day
  const thisMonday = new Date(todayDate);
  thisMonday.setUTCDate(todayDate.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const thisMondayStr = thisMonday.toISOString().split('T')[0];

  // First trading day >= this Monday
  const weekDays = days.filter(d => d.date >= thisMondayStr && d.date <= today);
  if (weekDays.length === 0) return false;

  const firstTradingDayThisWeek = weekDays[0].date;
  return firstTradingDayThisWeek === today;
}

// ---------------------------------------------------------------------------
// Middleware-style guard for use in API routes
// ---------------------------------------------------------------------------

/**
 * Throws an error (with a descriptive message) if the market is closed and
 * we are outside the tolerance window. Use at the top of api/rebalance.js.
 *
 * @param {number} withinMinutes
 */
async function assertMarketOpen(withinMinutes = 5) {
  const status = await checkMarketOpen(withinMinutes);
  if (!status.isOpen) {
    const err = new Error(`Market closed — skipping rebalance. ${status.message}`);
    err.code = 'MARKET_CLOSED';
    throw err;
  }
  return status;
}

module.exports = {
  checkMarketOpen,
  getTodaySession,
  getLastNTradingDays,
  isRebalanceDay,
  assertMarketOpen,
};
