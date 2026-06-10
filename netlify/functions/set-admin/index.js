const admin = require('firebase-admin');

// ============================================================
// Firebase Admin SDK シングルトン初期化
// 環境変数: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// FIREBASE_PRIVATE_KEY の改行は Netlify 上で \\n として保存する
// ============================================================
let _app;
function getApp() {
  if (_app) return _app;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase Admin credentials not configured');
  }
  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  return _app;
}

// ============================================================
// メールアドレス正規化・検証
// ============================================================
function normalizeEmail(val) {
  if (typeof val !== 'string') return null;
  const e = val.trim();
  if (!e || e.length > 254 || /[\r\n]/.test(e)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)) return null;
  return e;
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // CORS（send-email と同じパターン）
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';

  // set-admin は管理者権限付与/剥奪という最も高権限な操作のため
  // ALLOWED_ORIGIN 未設定時はクロスオリジンリクエストを全拒否（fail-closed）
  if (allowedOrigins.length === 0 && reqOrigin) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
      body: JSON.stringify({ error: 'ALLOWED_ORIGIN is not configured' }),
    };
  }

  let corsOrigin;
  if (allowedOrigins.length === 0) {
    // Originヘッダーなし = 同一オリジンリクエスト（Netlify内部等）
    corsOrigin = 'null';
  } else {
    corsOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : 'null';
  }

  const headers = {
    'Content-Type':                     'application/json',
    'Access-Control-Allow-Origin':      corsOrigin,
    'Access-Control-Allow-Headers':     'Content-Type, Authorization',
    'Access-Control-Allow-Methods':     'POST, OPTIONS',
    'X-Content-Type-Options':           'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  if (allowedOrigins.length > 0 && reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  // ── Bearer トークン取得 ──────────────────────────────────────
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!idToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    getApp();

    // ── 呼び出し元トークン検証 ──────────────────────────────────
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    if (!decoded.admin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin required' }) };
    }

    // ── リクエスト解析 ──────────────────────────────────────────
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { action, email: rawEmail } = body;
    const email = normalizeEmail(rawEmail);
    if (!email || !['grant', 'revoke'].includes(action)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    // 自分自身への操作を禁止（誤操作でログアウト不能になることを防ぐ）
    if (email.toLowerCase() === (decoded.email || '').toLowerCase()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot modify own admin status' }) };
    }

    // ── 対象ユーザーを検索 or 作成 ────────────────────────────────
    let user;
    let created = false;

    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (action === 'revoke') {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
      }
      // grant: アカウントを新規作成（パスワード未設定 → クライアント側でリセットメール送信）
      user    = await admin.auth().createUser({ email, emailVerified: false });
      created = true;
    }

    // ── カスタムクレーム設定 ─────────────────────────────────────
    const newClaims = action === 'grant' ? { admin: true } : { admin: false };
    await admin.auth().setCustomUserClaims(user.uid, newClaims);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, uid: user.uid, created }),
    };
  } catch (e) {
    // S-7: 内部エラー詳細をクライアントに漏洩させない
    console.error('set-admin error:', e.code || e.message || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
