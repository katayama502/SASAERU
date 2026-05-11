const admin      = require('firebase-admin');
const nodemailer = require('nodemailer');

// ============================================================
// Firebase Admin 初期化（シングルトン）
// 環境変数 FIREBASE_SERVICE_ACCOUNT に JSON 文字列をセット
// ============================================================
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// ============================================================
// レート制限（送信元IPごとに60秒で最大3回）
// ============================================================
const _rateMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const limit  = 3;
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
// Gmail トランスポーター
// ============================================================
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    connectionTimeout: 8000,
    greetingTimeout:   5000,
    socketTimeout:     8000,
  });
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';
  let corsOrigin;
  if (allowedOrigins.length === 0) {
    corsOrigin = reqOrigin || 'null';
  } else {
    corsOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
  }

  if (!GMAIL_USER || !GMAIL_PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email not configured' }) };
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, origin } = body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  // origin をホワイトリストで検証（許可オリジン内のみ受け付ける）
  const safeOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || 'https://sasaeru.netlify.app');

  try {
    // Firebase Admin SDK でメール確認リンクを生成
    const verifyLink = await admin.auth().generateEmailVerificationLink(
      email.trim(),
      { url: `${safeOrigin}/mypage.html` },
    );

    // Gmail で送信
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"SASAERU 運営事務局" <${GMAIL_USER}>`,
      to:      email.trim(),
      subject: '【SASAERU】メールアドレスの確認をお願いします',
      text: [
        'SASAERUへのご登録ありがとうございます。',
        '',
        '以下のリンクをクリックして、メールアドレスの確認を完了してください。',
        '（リンクの有効期限は24時間です）',
        '',
        verifyLink,
        '',
        '─────────────────────────',
        'このメールに心当たりがない場合は、このメールを無視してください。',
        '─────────────────────────',
        '',
        'SASAERU 運営事務局',
        safeOrigin,
      ].join('\n'),
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('send-verify-email error:', e.message, e.code);
    // Firebase Auth のエラーコードは一部クライアントに返す（UX のため）
    if (e.code === 'auth/user-not-found') {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'user-not-found' }) };
    }
    if (e.code === 'auth/email-already-verified') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'already-verified' }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'メール送信に失敗しました' }) };
  }
};
