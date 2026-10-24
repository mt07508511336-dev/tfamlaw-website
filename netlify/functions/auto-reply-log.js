// Password-protected page showing every auto-reply decision (newest first).
// Open: https://tfamlaw.co.uk/.netlify/functions/auto-reply-log?key=YOUR_PASSWORD
// The password is the Netlify setting AUTO_REPLY_LOG_PASSWORD.

const { getStore, connectLambda } = require('@netlify/blobs');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

exports.handler = async (event) => {
  connectLambda(event); // lets this function use Netlify's built-in storage
  const pass = process.env.AUTO_REPLY_LOG_PASSWORD;
  if (!pass || (event.queryStringParameters || {}).key !== pass) {
    return { statusCode: 401, body: 'Not authorised' };
  }
  const store = getStore('auto-reply');
  const { blobs } = await store.list({ prefix: 'log/' });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 200);
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' })));

  const tr = rows.filter(Boolean).map((r) => `<tr>
    <td>${esc(r.at.replace('T', ' ').slice(0, 16))}</td>
    <td>${esc(r.name)}<br><small>${esc(r.email)}</small></td>
    <td>${esc(r.ai && r.ai.category)}</td>
    <td style="color:${r.decision && r.decision.send ? '#1b7f3b' : '#a33'}">${r.decision && r.decision.send ? 'SENT' : 'Not sent'}${r.sentTo && !r.live ? ' (test, to ' + esc(r.sentTo) + ')' : ''}</td>
    <td>${esc(r.error ? 'ERROR: ' + r.error : r.decision && r.decision.why)}<br><small>${esc(r.ai && r.ai.reason)}</small></td>
  </tr>`).join('');

  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auto-reply log</title>
<style>body{font-family:Arial,sans-serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top;font-size:14px}th{background:#354d91;color:#fff}</style>
<h2>Website auto-reply log</h2><p>Mode: <strong>${(process.env.AUTO_REPLY_MODE || '').toLowerCase() === 'live' ? 'LIVE' : 'TEST'}</strong> &middot; last ${keys.length} enquiries</p>
<table><tr><th>When (UTC)</th><th>Who</th><th>Type</th><th>Result</th><th>Why</th></tr>${tr}</table>`;
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html };
};

