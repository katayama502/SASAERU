const admin = require('firebase-admin');

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
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

const _rateMap = new Map();
function isRateLimited(ip) {
  const now   = Date.now();
  const win   = 60 * 1000;
  const limit = 10;
  const entry = _rateMap.get(ip) || { count: 0, reset: now + win };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + win; }
  entry.count += 1;
  _rateMap.set(ip, entry);
  if (_rateMap.size > 500) {
    for (const [k, v] of _rateMap) { if (now > v.reset) _rateMap.delete(k); }
  }
  return entry.count > limit;
}

exports.handler = async (event) => {
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
  if (reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
  }

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

  const { orgId, uid, email, action } = body;
  const isOrphanMode = action === 'orphan';
  if (isOrphanMode) {
    if (!normalizeEmail(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
    }
  } else if (!isNonEmptyString(orgId) && !isNonEmptyString(uid)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing orgId' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const auth = firebaseAdmin.auth();
    const db   = firebaseAdmin.firestore();

    // 呼び出し元が管理者であることを確認
    let callerClaims;
    try {
      callerClaims = await auth.verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid ID token' }) };
    }
    if (callerClaims.admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin privilege required' }) };
    }

    // ── モード1: 団体を持たない孤立アカウントをメールアドレスで削除 ──────────
    // 団体データは消えたのに Auth だけ残り「既に登録されています」になる状態の救済用
    if (isOrphanMode) {
      let user;
      try {
        user = await auth.getUserByEmail(normalizeEmail(email));
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'user-not-found' }) };
        }
        throw e;
      }
      const guard = await checkDeletable(db, user, callerClaims.uid, null);
      if (guard) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error }) };
      await deleteAuthUser(auth, user.uid);
      console.log(`delete-org-user: deleted orphan auth uid=${user.uid}`);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, authDeleted: [user.uid] }) };
    }

    // ── 旧呼び出し（uid のみ）: Auth だけ削除 ─────────────────────────────
    if (!isNonEmptyString(orgId)) {
      const target = uid.trim();
      if (target === callerClaims.uid) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '自分自身のアカウントは削除できません' }) };
      }
      await deleteAuthUser(auth, target);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, authDeleted: [target] }) };
    }

    // ── モード2: 団体を丸ごと削除（Auth → Firestore の順） ─────────────────
    // Auth を先に消す: 失敗したら Firestore には触れずエラーを返すので、管理画面から再試行できる。
    // （以前は Firestore を先に消していたため、Auth 削除に失敗すると団体が一覧から消え、
    //   ログインアカウントだけが残って同じメールで再登録できなくなっていた）
    const orgRef  = db.collection('organizations').doc(orgId.trim());
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'org-not-found' }) };
    }
    const org = orgSnap.data() || {};

    const targets = new Set();
    const kept    = [];
    if (isNonEmptyString(org.owner_uid)) {
      try {
        const owner = await auth.getUser(org.owner_uid.trim());
        const guard = await checkDeletable(db, owner, callerClaims.uid, orgRef.id);
        if (guard) kept.push(guard.error); else targets.add(owner.uid);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
    }
    // 登録メールで作られた別アカウント（作り直し等で owner_uid とずれたもの）も対象にする。
    // 他の団体の持ち主・管理者は checkDeletable で除外する
    const contact = normalizeEmail(org.contact_email);
    if (contact) {
      try {
        const byEmail = await auth.getUserByEmail(contact);
        if (!targets.has(byEmail.uid)) {
          const guard = await checkDeletable(db, byEmail, callerClaims.uid, orgRef.id);
          if (!guard) targets.add(byEmail.uid);
        }
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
    }
    const authDeleted = [];
    for (const t of targets) {
      await deleteAuthUser(auth, t);
      authDeleted.push(t);
    }

    // Firestore: 団体（menus と、その下の matchings を含むサブコレクションすべて）
    await db.recursiveDelete(orgRef);
    // 団体宛の支援申請・活動日記
    const refs = [];
    const inqSnap = await db.collection('inquiries').where('org_id', '==', orgRef.id).get();
    inqSnap.docs.forEach(d => refs.push(d.ref));
    const postsByOrg = await db.collection('posts').where('org_id', '==', orgRef.id).get();
    postsByOrg.docs.forEach(d => refs.push(d.ref));
    if (isNonEmptyString(org.owner_uid)) {
      const postsByOwner = await db.collection('posts').where('owner_uid', '==', org.owner_uid).get();
      postsByOwner.docs.forEach(d => { if (!refs.some(r => r.path === d.ref.path)) refs.push(d.ref); });
    }
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }

    console.log(`delete-org-user: deleted org=${orgRef.id} auth=${authDeleted.length} related=${refs.length}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, authDeleted, authKept: kept, relatedDeleted: refs.length }) };
  } catch (e) {
    if (e.code === 'config/firebase') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase not configured' }) };
    }
    console.error('delete-org-user error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'アカウント削除に失敗しました' }) };
  }
};

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim();
  if (email.length === 0 || email.length > 254 || /[\r\n]/.test(email)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

// Auth 削除。既に存在しない場合は成功扱い（再試行しても安全）
async function deleteAuthUser(auth, uid) {
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
}

// 削除してはいけないアカウントなら { status, error } を返す
// - 自分自身 / 管理者（claim または admins コレクション）
// - allowOrgId 以外の団体を持っているアカウント
async function checkDeletable(db, user, callerUid, allowOrgId) {
  if (user.uid === callerUid) return { status: 400, error: '自分自身のアカウントは削除できません' };
  if (user.customClaims && user.customClaims.admin === true) return { status: 400, error: 'admin-account' };
  const adminDoc = await db.collection('admins').doc(user.uid).get();
  if (adminDoc.exists) return { status: 400, error: 'admin-account' };
  const owned = await db.collection('organizations').where('owner_uid', '==', user.uid).get();
  if (owned.docs.some(d => d.id !== allowOrgId)) return { status: 409, error: 'has-organization' };
  return null;
}
