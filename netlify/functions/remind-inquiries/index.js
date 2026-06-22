const admin    = require('firebase-admin');
const nodemailer = require('nodemailer');

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
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

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
// ハンドラー（毎週月曜 9:00 JST = UTC 00:00 に実行）
// netlify.toml: [functions."remind-inquiries"] schedule = "0 0 * * 1"
// ============================================================
exports.handler = async (event) => {
  // ============================================================
  // 実行ガード:
  // (a) Netlify スケジュール実行（body に next_run を含む）
  // (b) x-remind-secret ヘッダーが REMIND_SECRET と一致（手動テスト用）
  // のいずれかを満たさない場合は 403 を返す
  // ============================================================
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(event.body || '{}');
  } catch (e) {
    parsedBody = {};
  }
  const isScheduled = parsedBody && typeof parsedBody === 'object' && 'next_run' in parsedBody;
  const remindSecret = process.env.REMIND_SECRET;
  const headerSecret = event.headers?.['x-remind-secret'] || event.headers?.['X-Remind-Secret'] || '';
  const hasValidSecret = !!remindSecret && headerSecret === remindSecret;
  if (!isScheduled && !hasValidSecret) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  try {
    const firebaseAdmin = getFirebaseAdmin();
    const db = firebaseAdmin.firestore();

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = new Date(now - SEVEN_DAYS_MS);

    // status が 'new' または 'in_progress' でリマインド未送信 or 7日以上前の申請を取得
    const snap = await db.collection('inquiries')
      .where('status', 'in', ['new', 'in_progress'])
      .get();

    const targets = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(inq => {
        const lastSent = inq.lastReminderSentAt?.toDate?.() || null;
        const createdAt = inq.created_at?.toDate?.() || null;
        // 作成から7日以上経過している
        if (!createdAt || createdAt > cutoff) return false;
        // まだリマインドを送っていない、または前回送信から7日以上経過
        if (!lastSent) return true;
        return (now - lastSent.getTime()) >= SEVEN_DAYS_MS;
      });

    if (targets.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ reminded: 0 }) };
    }

    // org_id ごとにグループ化して1通にまとめる
    const orgGroups = new Map();
    for (const inq of targets) {
      if (!inq.org_id) continue;
      if (!orgGroups.has(inq.org_id)) orgGroups.set(inq.org_id, []);
      orgGroups.get(inq.org_id).push(inq);
    }

    const GMAIL_USER        = process.env.GMAIL_USER;
    const ADMIN_EMAIL       = process.env.ADMIN_EMAIL       || GMAIL_USER;
    const EXTRA_ADMIN_EMAIL = process.env.EXTRA_ADMIN_EMAIL || 'sasaeru@scl.or.jp';
    const bcc = [...new Set([ADMIN_EMAIL, EXTRA_ADMIN_EMAIL].filter(Boolean))].join(', ');
    if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('GMAIL credentials not configured');
      return { statusCode: 500, body: JSON.stringify({ error: 'email not configured' }) };
    }

    const transporter = createTransporter();
    const ts  = admin.firestore.FieldValue.serverTimestamp();
    let sent  = 0;

    for (const [orgId, inquiries] of orgGroups) {
      // org の contact_email を取得
      const orgSnap = await db.collection('organizations').doc(orgId).get();
      if (!orgSnap.exists) continue;
      const org = orgSnap.data();
      const toEmail = org.contact_email;
      if (!toEmail) continue;

      const list = inquiries.map(inq =>
        `・${inq.company_name || '企業名不明'}（申請日：${inq.created_at?.toDate?.()?.toLocaleDateString('ja-JP') || '不明'}）`
      ).join('\n');

      try {
        await transporter.sendMail({
          from: `"SASAERU 運営事務局" <${process.env.MAIL_FROM || 'sasaeru@scl.or.jp'}>`,
          replyTo: process.env.MAIL_FROM || 'sasaeru@scl.or.jp',
          to: toEmail,
          bcc,
          subject: '【SASAERU】未対応の支援申請があります',
          text: [
            `${org.name || '団体'} 様`,
            '',
            '以下の支援申請が未対応のままになっています。',
            '対応が完了した場合は、マイページの支援メニューから「支援完了」ボタンを押してください。',
            '（完了ボタンを押すと申請が自動的にクローズされ、このリマインドも止まります）',
            '',
            list,
            '',
            '▼ マイページへログインして対応する',
            'https://sasaeru.netlify.app/',
            '',
            'SASAERU 運営事務局',
          ].join('\n'),
        });

        // lastReminderSentAt を一括更新
        const batch = db.batch();
        for (const inq of inquiries) {
          batch.update(db.collection('inquiries').doc(inq.id), { lastReminderSentAt: ts });
        }
        await batch.commit();
        sent += inquiries.length;
      } catch (emailErr) {
        console.error(`Failed to send reminder to ${toEmail}:`, emailErr.code || emailErr.message);
      }
    }

    console.log(`remind-inquiries: sent reminders for ${sent} inquiries`);
    return { statusCode: 200, body: JSON.stringify({ reminded: sent }) };
  } catch (e) {
    console.error('remind-inquiries error:', e.code || e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
