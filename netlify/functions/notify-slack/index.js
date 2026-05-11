const https = require('https');
const { URL } = require('url');

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_SUPPORT_MENU;

// ============================================================
// レート制限（IPごとに60秒で最大10回）
// ============================================================
const _rateMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const limit  = 10;
  const entry  = _rateMap.get(ip) || { count: 0, reset: now + window };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
  entry.count += 1;
  _rateMap.set(ip, entry);
  if (_rateMap.size > 500) {
    for (const [k, v] of _rateMap) { if (now > v.reset) _rateMap.delete(k); }
  }
  return entry.count > limit;
}

// ============================================================
// HTTPS POSTヘルパー
// ============================================================
function postJson(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const u    = new URL(urlStr);
    const body = JSON.stringify(payload);
    const req  = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';
  const corsOrigin     = allowedOrigins.includes(reqOrigin) ? reqOrigin : (allowedOrigins[0] || '*');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin':  corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{}' };

  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
  }

  if (!WEBHOOK_URL) {
    // Slack未設定の場合はサイレント成功（通知オプショナル扱い）
    console.warn('SLACK_WEBHOOK_URL_SUPPORT_MENU is not set');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // 入力値のサニタイズ（改行・特殊文字を除去）
  const sanitize = v => String(v ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 300);
  const orgName     = sanitize(body.orgName);
  const menuTitle   = sanitize(body.menuTitle);
  const targetAmount = sanitize(body.targetAmount);
  const origin      = allowedOrigins.includes(body.origin) ? body.origin : (allowedOrigins[0] || 'https://sasaeru.netlify.app');

  const lines = [
    ':new: *新規支援メニューが登録されました*',
    `*団体名*：${orgName || '不明'}`,
    `*メニュー名*：${menuTitle || '不明'}`,
  ];
  if (targetAmount) lines.push(`*希望金額・数量*：${targetAmount}`);
  lines.push(`*管理画面*：${origin}/admin.html`);

  try {
    const result = await postJson(WEBHOOK_URL, { text: lines.join('\n') });
    if (result.status !== 200) {
      console.error('Slack webhook error:', result.status, result.body);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Slack error' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch(e) {
    console.error('notify-slack error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Notification failed' }) };
  }
};
