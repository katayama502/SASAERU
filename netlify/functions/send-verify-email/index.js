const admin      = require('firebase-admin');
const nodemailer = require('nodemailer');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// ============================================================
// Firebase Admin 初期化（シングルトン）
// 環境変数 FIREBASE_SERVICE_ACCOUNT に JSON 文字列をセット
// ============================================================
function getFirebaseAuth() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    const err = new Error('Firebase not configured');
    err.code = 'config/firebase';
    throw err;
  }
  if (!admin.apps.length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      const err = new Error('Firebase not configured');
      err.code = 'config/firebase';
      throw err;
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  return admin.auth();
}

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

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== 'string') return null;
  const email = rawEmail.trim();
  if (email.length === 0 || email.length > 254 || /[\r\n]/.test(email)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // ALLOWED_ORIGIN 未設定時は本番オリジンのみ許可（fail-closed）
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'https://sasaeru.netlify.app').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';
  const corsOrigin     = allowedOrigins.includes(reqOrigin) ? reqOrigin : 'null';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  // Origin ヘッダーがあり許可リスト外なら拒否（Origin なしのサーバー間リクエストは許可）
  if (reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

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
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  // origin をホワイトリストで検証（許可オリジン内のみ受け付ける）
  const safeOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || 'https://sasaeru.netlify.app');

  try {
    // Firebase Admin SDK でメール確認リンクを生成
    const verifyLink = await getFirebaseAuth().generateEmailVerificationLink(
      normalizedEmail,
      { url: `${safeOrigin}/mypage.html` },
    );

    // Firebase ホストの確認ページ（英語表記）を経由させず、
    // 自サイトの mypage.html（日本語UI・applyActionCode 処理あり）へ直接誘導する
    let mailLink = verifyLink;
    try {
      const oobCode = new URL(verifyLink).searchParams.get('oobCode');
      if (oobCode) {
        mailLink = `${safeOrigin}/mypage.html?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;
      }
    } catch (_) { /* パース失敗時は Firebase 生成リンクをそのまま使用 */ }

    // Gmail で送信
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"SASAERU 運営事務局" <${process.env.MAIL_FROM || 'sasaeru@scl.or.jp'}>`,
      replyTo: process.env.MAIL_FROM || 'sasaeru@scl.or.jp',
      to:      normalizedEmail,
      subject: '【SASAERU】メールアドレスの確認をお願いします',
      text: [
        'SASAERUへのご登録ありがとうございます。',
        '',
        '以下のリンクをクリックして、メールアドレスの確認を完了してください。',
        '（リンクの有効期限は24時間です）',
        '',
        mailLink,
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
    console.error('send-verify-email error:', e.code || e.name || 'unknown');
    // Firebase Auth のエラーコードは一部クライアントに返す（UX のため）
    if (e.code === 'auth/user-not-found') {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'user-not-found' }) };
    }
    if (e.code === 'auth/email-already-verified') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'already-verified' }) };
    }
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'メール送信に失敗しました' }) };
  }
};
