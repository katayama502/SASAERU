/**
 * Netlify Function: create-admin
 *
 * Creates a new Firebase admin user and sends an invitation email.
 *
 * Required environment variables:
 *   FIREBASE_PROJECT_ID    — Firebase project ID (default: sasaeru-7f375)
 *   FIREBASE_PRIVATE_KEY_ID — Firebase service account private key ID
 *   FIREBASE_PRIVATE_KEY    — Firebase service account private key (PEM, \\n for newlines)
 *   FIREBASE_CLIENT_EMAIL   — Firebase service account client email
 *   FIREBASE_CLIENT_ID      — Firebase service account client ID
 *
 * POST /.netlify/functions/create-admin
 * Body: { "email": "...", "password": "..." }
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Firebase Admin 初期化
function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID || 'sasaeru-7f375',
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  };
  initializeApp({ credential: cert(serviceAccount) });
}

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length === 0 || e.length > 254 || /[\r\n]/.test(e)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)) return null;
  return e;
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Firebase Admin SDKが設定されているか確認
  const hasAdminConfig = process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password.trim() : '';

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '有効なメールアドレスを入力してください' }) };
  }
  if (!password || password.length < 8) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'パスワードは8文字以上で入力してください' }) };
  }
  if (password.length > 128) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'パスワードが長すぎます' }) };
  }

  // Firebase Admin SDKが未設定の場合は send-email 経由の招待のみ実行
  if (!hasAdminConfig) {
    // フォールバック: Firebase Admin不要の招待メール送信のみ
    try {
      const siteOrigin = event.headers.origin || event.headers.referer || 'https://sasaeru.netlify.app';
      await sendInviteEmail(email, password, siteOrigin);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '招待メールを送信しました（Firebase Admin未設定のため、アカウント作成は手動で行ってください）',
          manualSetup: true
        })
      };
    } catch (emailErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: '招待メールの送信に失敗しました: ' + emailErr.message }) };
    }
  }

  try {
    initFirebaseAdmin();
    const adminAuth = getAuth();

    // ユーザー作成
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (createErr) {
      if (createErr.code === 'auth/email-already-exists') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'このメールアドレスはすでに登録されています' }) };
      }
      throw createErr;
    }

    // admin カスタムクレーム設定
    await adminAuth.setCustomUserClaims(userRecord.uid, { admin: true });

    // パスワードリセットリンク生成（新管理者はこれでパスワード設定）
    const siteOrigin = event.headers.origin || event.headers.referer || 'https://sasaeru.netlify.app';
    let resetLink = '';
    try {
      resetLink = await adminAuth.generatePasswordResetLink(email);
    } catch (linkErr) {
      console.warn('generatePasswordResetLink error:', linkErr.message);
    }

    // 招待メール送信
    await sendInviteEmail(email, password, siteOrigin, resetLink);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        uid: userRecord.uid,
        message: `管理者アカウントを作成し、招待メールを送信しました: ${email}`
      })
    };
  } catch (err) {
    console.error('create-admin error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || '管理者アカウントの作成に失敗しました' })
    };
  }
};

async function sendInviteEmail(email, password, origin, resetLink) {
  const baseUrl = (origin || '').replace(/\/$/, '');
  const adminUrl = `${baseUrl}/admin.html`;

  const res = await fetch(`${baseUrl}/.netlify/functions/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'admin_invite',
      params: {
        toEmail: email,
        adminUrl,
        tempPassword: password,
        resetLink: resetLink || adminUrl,
      }
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`メール送信失敗: HTTP ${res.status} ${text.slice(0, 100)}`);
  }
}
