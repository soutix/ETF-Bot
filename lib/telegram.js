// lib/telegram.js — CommonJS
// Sends alerts to Telegram when the bot rebalances

async function sendMessage(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // silently skip if not configured

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.warn('[telegram] Failed to send message:', e.message);
  }
}

async function alertRebalance({ action, asset, side, price, notional, equity, dryRun }) {
  const mode  = dryRun ? '📄 PAPER' : '🔴 LIVE';
  const emoji = side === 'BUY' ? '🟢' : '🔴';
  const text  = action === 'HOLD'
    ? `⏸ <b>CryptoBot — HOLD</b>\n${mode} | No signal change\n💰 Equity: <b>$${equity?.toFixed(2)}</b>`
    : `${emoji} <b>CryptoBot — ${side} ${asset}</b>\n${mode}\n📈 Price: <b>$${price?.toLocaleString()}</b>\n💵 Amount: <b>$${notional?.toFixed(2)}</b>\n💰 Equity: <b>$${equity?.toFixed(2)}</b>`;
  return sendMessage(text);
}

async function alertStopLoss({ asset, price, loss, equity, dryRun }) {
  const mode = dryRun ? '📄 PAPER' : '🔴 LIVE';
  const text = `🛑 <b>CryptoBot — STOP LOSS ${asset}</b>\n${mode}\n📉 Price: <b>$${price?.toLocaleString()}</b>\n🔻 Loss: <b>${(loss*100).toFixed(1)}%</b>\n💰 Equity: <b>$${equity?.toFixed(2)}</b>`;
  return sendMessage(text);
}

async function alertError(message) {
  return sendMessage(`❌ <b>CryptoBot — ERROR</b>\n${message}`);
}

module.exports = { sendMessage, alertRebalance, alertStopLoss, alertError };
