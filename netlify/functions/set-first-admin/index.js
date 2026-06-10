const admin = require('firebase-admin');

// ============================================================
// Firebase Admin 初期化（シングルトン）
// 環境変数 FIREBASE_SERVICE_ACCOUNT に JSON 文字列をセット
// ============================================================
function getFirebaseAdmin() {
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
  return admin;
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
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';
  let corsOrigin;
  if (allowedOrigins.length === 0) {
    corsOrigin = reqOrigin || 'null';
  } else {
    corsOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : 'null';
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
  if (allowedOrigins.length > 0 && reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  // ADMIN_BOOTSTRAP_SECRET が未設定の場合は機能を無効化
  if (!process.env.ADMIN_BOOTSTRAP_SECRET) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Bootstrap disabled' }) };
  }

  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
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

  const { email, secret } = body;

  // シークレットキーの検証
  if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid secret' }) };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const auth = firebaseAdmin.auth();
    const db   = firebaseAdmin.firestore();

    // 対象ユーザーを email で検索
    let targetUser;
    try {
      targetUser = await auth.getUserByEmail(normalizedEmail);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'user-not-found' }) };
      }
      throw e;
    }

    // Custom Claim をセット
    await auth.setCustomUserClaims(targetUser.uid, { admin: true });

    // Firestore admins コレクションに記録
    await db.collection('admins').doc(targetUser.uid).set({
      uid:      targetUser.uid,
      email:    normalizedEmail,
      added_by: 'bootstrap',
      added_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok:    true,
        uid:   targetUser.uid,
        email: normalizedEmail,
      }),
    };
  } catch (e) {
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    console.error('set-first-admin error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: '管理者権限の設定に失敗しました' }) };
  }
};
