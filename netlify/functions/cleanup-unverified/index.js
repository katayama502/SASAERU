const admin = require('firebase-admin');

// ============================================================
// メール未確認のまま期限を過ぎた登録申請の自動削除
// 以前はマイページ（ブラウザ）が登録10分後に削除していたが、
// 「代行申請」「後日ログインした瞬間に消える」事故が起きたためサーバー側に移した。
// 期限は mypage.html の VERIFY_TTL_MS と揃えること。
// ============================================================
const UNVERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日
const MAX_DELETE_PER_RUN = 50;                      // 1回の実行で削除する上限（タイムアウト対策）

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

// ============================================================
// ハンドラー（毎日 3:00 JST = UTC 18:00 に実行）
// netlify.toml: [functions."cleanup-unverified"] schedule = "0 18 * * *"
// ============================================================
exports.handler = async (event) => {
  // ============================================================
  // 実行ガード（remind-inquiries と同じ方式）:
  // (a) Netlify スケジュール実行（body に next_run を含む）
  // (b) x-cleanup-secret ヘッダーが CLEANUP_SECRET と一致（手動実行用）
  // ============================================================
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(event.body || '{}');
  } catch (e) {
    parsedBody = {};
  }
  const isScheduled   = parsedBody && typeof parsedBody === 'object' && 'next_run' in parsedBody;
  const cleanupSecret = process.env.CLEANUP_SECRET;
  const headerSecret  = event.headers?.['x-cleanup-secret'] || event.headers?.['X-Cleanup-Secret'] || '';
  const hasValidSecret = !!cleanupSecret && headerSecret === cleanupSecret;
  if (!isScheduled && !hasValidSecret) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  // 手動実行時は dryRun=true で削除せず対象だけ確認できる
  const dryRun = hasValidSecret && parsedBody.dryRun === true;

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const db   = firebaseAdmin.firestore();
    const auth = firebaseAdmin.auth();
    const cutoff = Date.now() - UNVERIFIED_TTL_MS;

    // 単一フィールドの等価条件のみ（複合インデックス不要）。期限・確認状態はコード側で判定
    const snap = await db.collection('organizations').where('status', '==', 'pending').get();
    const candidates = snap.docs.filter(d => {
      const o = d.data();
      if (o.emailVerified === true) return false;
      if (!o.owner_uid) return false; // 所有者不明のデータは触らない
      const createdAt = o.created_at?.toMillis?.();
      return typeof createdAt === 'number' && createdAt < cutoff;
    }).slice(0, MAX_DELETE_PER_RUN);

    const deleted = [];
    const skipped = [];
    for (const doc of candidates) {
      const o = doc.data();

      // Firestore の emailVerified が古いだけの場合があるため、Auth 側の状態を正とする
      let authUser = null;
      try {
        authUser = await auth.getUser(o.owner_uid);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') {
          console.error(`cleanup-unverified: getUser failed org=${doc.id}:`, e.code || e.message);
          skipped.push(doc.id);
          continue;
        }
      }
      if (authUser && authUser.emailVerified) {
        skipped.push(doc.id);
        continue;
      }

      if (dryRun) {
        deleted.push(doc.id);
        continue;
      }

      try {
        const batch = db.batch();
        const menusSnap = await doc.ref.collection('menus').get();
        menusSnap.docs.forEach(m => batch.delete(m.ref));
        batch.delete(doc.ref);
        await batch.commit();
        if (authUser) await auth.deleteUser(o.owner_uid);
        // 運営が「消えた理由」を後から追えるよう、削除内容をログに残す
        console.log(`cleanup-unverified: deleted org=${doc.id} name=${JSON.stringify(o.name || '')} created_at=${new Date(o.created_at.toMillis()).toISOString()}`);
        deleted.push(doc.id);
      } catch (e) {
        console.error(`cleanup-unverified: delete failed org=${doc.id}:`, e.code || e.message);
        skipped.push(doc.id);
      }
    }

    // ── 団体データの無い未確認ログインアカウント（孤立アカウント）の削除 ──────
    // 団体だけ先に消えて Auth が残ると、同じメールで「既に登録されています」になるため
    const orphans = [];
    let pageToken;
    let pages = 0;
    do {
      const list = await auth.listUsers(1000, pageToken);
      for (const u of list.users) {
        if (orphans.length >= MAX_DELETE_PER_RUN) break;
        if (u.emailVerified) continue;
        if (u.customClaims && u.customClaims.admin === true) continue; // 招待中の管理者（未確認）を守る
        const createdAt = new Date(u.metadata?.creationTime || 0).getTime();
        if (!createdAt || createdAt >= cutoff) continue;
        const owned = await db.collection('organizations').where('owner_uid', '==', u.uid).limit(1).get();
        if (!owned.empty) continue;
        const adminDoc = await db.collection('admins').doc(u.uid).get();
        if (adminDoc.exists) continue;
        if (!dryRun) {
          try {
            await auth.deleteUser(u.uid);
          } catch (e) {
            if (e.code !== 'auth/user-not-found') {
              console.error(`cleanup-unverified: orphan delete failed uid=${u.uid}:`, e.code || e.message);
              continue;
            }
          }
          console.log(`cleanup-unverified: deleted orphan auth uid=${u.uid} created_at=${new Date(createdAt).toISOString()}`);
        }
        orphans.push(u.uid);
      }
      pageToken = list.pageToken;
      pages += 1;
    } while (pageToken && pages < 10 && orphans.length < MAX_DELETE_PER_RUN);

    console.log(`cleanup-unverified: ${dryRun ? '[dryRun] ' : ''}deleted=${deleted.length} skipped=${skipped.length} orphans=${orphans.length}`);
    return { statusCode: 200, body: JSON.stringify({ deleted: deleted.length, skipped: skipped.length, orphansDeleted: orphans.length, dryRun, ids: deleted, orphanUids: orphans }) };
  } catch (e) {
    console.error('cleanup-unverified error:', e.code || e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'cleanup failed' }) };
  }
};
