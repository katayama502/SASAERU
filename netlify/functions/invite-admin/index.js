const admin    = require('firebase-admin');
const nodemailer = require('nodemailer');

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
// レート制限（送信元IPごとに60秒で最大5回）
// ============================================================
const _rateMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const limit  = 5;
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
// メールアドレス正規化・バリデーション
// ============================================================
function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== 'string') return null;
  const email = rawEmail.trim();
  if (email.length === 0 || email.length > 254 || /[\r\n]/.test(email)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

// ============================================================
// 仮パスワードバリデーション（8文字以上、英数記号を含む）
// ============================================================
function validateTempPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  // 英字・数字・記号以外の文字（制御文字・改行等）を拒否
  if (/[\r\n\t\x00-\x1F\x7F]/.test(password)) return false;
  // 英字・数字・記号のみ許可
  if (!/^[A-Za-z0-9!-/:-@[-`{-~]+$/.test(password)) return false;
  return true;
}

// ============================================================
// Gmail トランスポーター
// ============================================================
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 8000,
    greetingTimeout:   5000,
    socketTimeout:     8000,
  });
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // CORS 設定
  // ALLOWED_ORIGIN 未設定時は本番オリジンのみ許可（fail-closed）
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'https://sasaeru.netlify.app').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin      = event.headers.origin || event.headers.Origin || '';
  const corsOrigin     = allowedOrigins.includes(reqOrigin) ? reqOrigin : 'null';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  // Origin ヘッダーがあり許可リスト外なら拒否（Origin なしのサーバー間リクエストは許可）
  if (reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  // レート制限
  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
  }

  // Firebase 設定チェック
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
  }

  // Authorization ヘッダーから ID トークンを取得
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // リクエストボディのパース
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { targetEmail, tempPassword } = body;

  // targetEmail バリデーション
  const normalizedTarget = normalizeEmail(targetEmail);
  if (!normalizedTarget) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid targetEmail' }) };
  }

  // tempPassword バリデーション
  if (!validateTempPassword(tempPassword)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid tempPassword: 8文字以上の英数記号で入力してください' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const auth = firebaseAdmin.auth();

    // 呼び出し元のIDトークンを検証し、admin クレームを確認
    let callerClaims;
    try {
      callerClaims = await auth.verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid ID token' }) };
    }

    if (callerClaims.admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin privilege required' }) };
    }

    // 自分自身への操作を防止
    if (callerClaims.email === normalizedTarget) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '自分自身を招待することはできません' }) };
    }

    // Firebase Auth にユーザーを作成（既存の場合は取得）
    let targetUser;
    try {
      targetUser = await auth.createUser({
        email:         normalizedTarget,
        password:      tempPassword,
        emailVerified: false,
      });
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        // 既に存在する場合は既存ユーザーで続行
        targetUser = await auth.getUserByEmail(normalizedTarget);
      } else {
        throw e;
      }
    }

    const uid = targetUser.uid;

    // admin: true Custom Claim を付与
    await auth.setCustomUserClaims(uid, { admin: true });

    // パスワードリセットリンクを生成
    const passwordResetLink = await auth.generatePasswordResetLink(normalizedTarget);

    // 招待メールを送信
    const callerEmail = callerClaims.email || '管理者';
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"SASAERU 運営事務局" <${process.env.MAIL_FROM || 'sasaeru@scl.or.jp'}>`,
      replyTo: process.env.MAIL_FROM || 'sasaeru@scl.or.jp',
      to:      normalizedTarget,
      subject: '【SASAERU】管理者アカウントの招待',
      text: [
        `${callerEmail} から SASAERU 管理者として招待されました。`,
        '',
        `仮パスワード: ${tempPassword}`,
        '',
        '以下のリンクからパスワードを変更し、ログインしてください:',
        passwordResetLink,
        '',
        '※このリンクは24時間有効です。',
      ].join('\n'),
    });

    // Firestore admins コレクションに記録
    const db = firebaseAdmin.firestore();
    await db.collection('admins').doc(uid).set({
      uid,
      email:    normalizedTarget,
      added_by: callerEmail,
      added_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, uid, email: normalizedTarget }),
    };
  } catch (e) {
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    console.error('invite-admin error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: '管理者の招待に失敗しました' }) };
  }
};
