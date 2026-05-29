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
// レート制限（送信元IPごとに60秒で最大10回）
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (allowedOrigins.length > 0 && reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
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

  // Authorization ヘッダーから ID トークンを取得
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { targetEmail, action } = body;
  const normalizedTarget = normalizeEmail(targetEmail);
  if (!normalizedTarget) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid targetEmail' }) };
  }
  if (action !== 'add' && action !== 'remove') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action must be "add" or "remove"' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const auth = firebaseAdmin.auth();

    // リクエスト元ユーザーのトークンを検証し、admin クレームを確認
    let callerClaims;
    try {
      callerClaims = await auth.verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid ID token' }) };
    }

    if (callerClaims.admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin privilege required' }) };
    }

    // 対象ユーザーを email で検索
    let targetUser;
    try {
      targetUser = await auth.getUserByEmail(normalizedTarget);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'user-not-found' }) };
      }
      throw e;
    }

    // 自分自身への操作を防止
    if (targetUser.uid === callerClaims.uid) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '自分自身の管理者権限は変更できません' }) };
    }

    // Custom Claim をセット/削除
    const newClaims = action === 'add' ? { admin: true } : { admin: false };
    await auth.setCustomUserClaims(targetUser.uid, newClaims);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        uid: targetUser.uid,
        email: normalizedTarget,
        action,
      }),
    };
  } catch (e) {
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    console.error('set-admin-claim error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: '管理者権限の変更に失敗しました' }) };
  }
};
