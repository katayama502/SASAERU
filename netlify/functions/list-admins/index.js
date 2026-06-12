const admin = require('firebase-admin');

// ============================================================
// Firebase Admin 初期化（シングルトン）
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
// レート制限（60秒で最大20回）
// ============================================================
const _rateMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const limit  = 20;
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
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

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
  }

  // Authorization ヘッダーから ID トークンを取得・検証
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const auth = firebaseAdmin.auth();
    const db   = firebaseAdmin.firestore();

    // 呼び出し元のトークンを検証し admin クレームを確認
    let callerClaims;
    try {
      callerClaims = await auth.verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid ID token' }) };
    }

    if (callerClaims.admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin privilege required' }) };
    }

    // Firestore admins コレクションを Admin SDK（ルールバイパス）で取得
    const snap = await db.collection('admins').orderBy('added_at', 'desc').get();

    const admins = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id:       doc.id,
        uid:      d.uid      || '',
        email:    d.email    || '',
        added_by: d.added_by || '',
        // Timestamp → ISO文字列に変換（クライアントで扱いやすくする）
        added_at: d.added_at ? d.added_at.toDate().toISOString() : null,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, admins }),
    };
  } catch (e) {
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    console.error('list-admins error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: '管理者一覧の取得に失敗しました' }) };
  }
};
