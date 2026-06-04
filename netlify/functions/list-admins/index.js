/**
 * Netlify Function: list-admins
 *
 * Lists all Firebase users with the admin custom claim.
 *
 * Required environment variables:
 *   FIREBASE_PROJECT_ID    — Firebase project ID (default: sasaeru-7f375)
 *   FIREBASE_PRIVATE_KEY_ID — Firebase service account private key ID
 *   FIREBASE_PRIVATE_KEY    — Firebase service account private key (PEM, \\n for newlines)
 *   FIREBASE_CLIENT_EMAIL   — Firebase service account client email
 *   FIREBASE_CLIENT_ID      — Firebase service account client ID
 *
 * GET /.netlify/functions/list-admins
 * Returns: { admins: [{ uid, email, emailVerified, createdAt }] }
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

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

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    return { statusCode: 200, headers, body: JSON.stringify({ admins: [], note: 'Firebase Admin未設定' }) };
  }

  try {
    initFirebaseAdmin();
    const adminAuth = getAuth();
    // Firebaseはカスタムクレームでの直接フィルタ不可 — 全ユーザー列挙（最大1000件）
    const listResult = await adminAuth.listUsers(1000);
    const admins = listResult.users
      .filter(u => u.customClaims?.admin === true)
      .map(u => ({
        uid: u.uid,
        email: u.email || '',
        emailVerified: u.emailVerified,
        createdAt: u.metadata.creationTime,
      }));
    return { statusCode: 200, headers, body: JSON.stringify({ admins }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
