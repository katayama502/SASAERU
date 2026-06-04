const nodemailer = require('nodemailer');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || GMAIL_USER;

// ============================================================
// S-3: インメモリ レート制限（送信元IPごとに60秒で最大5回）
// ============================================================
const _rateMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 60 * 1000; // 60秒
  const limit  = 5;
  const entry  = _rateMap.get(ip) || { count: 0, reset: now + window };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
  entry.count += 1;
  _rateMap.set(ip, entry);
  // 古いエントリを定期削除
  if (_rateMap.size > 500) {
    for (const [k, v] of _rateMap) { if (now > v.reset) _rateMap.delete(k); }
  }
  return entry.count > limit;
}

// ============================================================
// S-2: 入力サニタイズ（改行注入・ヘッダーインジェクション防止）
// S-9: lines フィールドは改行を保持（メール本文整形に使用するため）
// ============================================================
function sanitize(val, maxLen = 500, keepNewlines = false) {
  if (val == null) return '';
  let s = String(val);
  if (keepNewlines) {
    // ヘッダーインジェクションのみ防止（\r は除去、\n は保持）
    s = s.replace(/\r/g, '').replace(/[^\S \n]/g, ' ');
  } else {
    s = s.replace(/[\r\n]/g, ' ').replace(/[^\S ]/g, ' ');
  }
  return s.trim().slice(0, maxLen);
}

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== 'string') return null;
  const email = rawEmail.trim();
  if (email.length === 0 || email.length > 254 || /[\r\n]/.test(email)) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

function clientError(message) {
  const err = new Error(message);
  err.code = 'validation/client';
  return err;
}

function requireFields(params, fields) {
  for (const field of fields) {
    if (!params[field]) throw clientError(`Missing ${field}`);
  }
}

function requireEmail(params, field) {
  const email = normalizeEmail(params[field]);
  if (!email) throw clientError(`Invalid ${field}`);
  params[field] = email;
}

// ============================================================
// Gmail トランスポーター
// S-8: SMTPタイムアウトを設定（Netlifyの10秒制限内に収める）
// ============================================================
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    connectionTimeout: 8000,  // 8秒（Netlify 10秒制限内）
    greetingTimeout:   5000,
    socketTimeout:     8000,
  });
}

// ============================================================
// メールオプション生成
// ============================================================
function buildMailOptions(type, rawParams) {
  // 全パラメータをサニタイズ
  const p = {};
  for (const [k, v] of Object.entries(rawParams || {})) {
    // lines は本文整形のため改行を保持、その他は改行除去（ヘッダーインジェクション防止）
    const keepNl = (k === 'lines');
    p[k] = sanitize(v, k === 'message' || k === 'lines' ? 2000 : 500, keepNl);
  }

  const from = `"SASAERU 運営事務局" <${GMAIL_USER}>`;

  switch (type) {

    // 管理者通知
    case 'admin_notify':
      requireFields(p, ['label', 'origin']);
      return {
        from,
        to: ADMIN_EMAIL,
        subject: `【SASAERU】${p.label}`,
        text: [
          p.label,
          '',
          p.lines,
          '',
          `🔗 管理画面: ${p.origin}/admin.html`,
        ].join('\n'),
      };

    // 登録受付メール（申請者向け）
    case 'applicant':
      requireFields(p, ['clubName', 'categoryJp', 'registeredAt', 'origin']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        subject: '【SASAERU】団体登録を受け付けました',
        text: [
          `${p.clubName} 様`,
          '',
          'この度はSASAERUにご登録いただきありがとうございます。',
          '',
          '以下の内容で申請を受け付けました。',
          '─────────────────────────',
          `団体名：${p.clubName}`,
          `カテゴリ：${p.categoryJp}`,
          `受付日時：${p.registeredAt}`,
          '─────────────────────────',
          '',
          '【重要】メールアドレスの確認が必要です',
          '─────────────────────────',
          'このメールとは別に「メールアドレスの確認」メールが届いています。',
          'そちらのメール内のリンクをクリックして認証を完了してください。',
          '※ このメールのリンクでは認証できません。',
          '─────────────────────────',
          '',
          '認証完了後、マイページにてご登録状況をご確認いただけます。',
          '審査が完了次第、改めてご連絡いたします。',
          '',
          '今しばらくお待ちください。',
          '',
          'SASAERU 運営事務局',
          p.origin,
        ].join('\n'),
      };

    // 承認メール
    case 'approve':
      requireFields(p, ['toName', 'clubName', 'approvedAt', 'clubPageUrl']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        subject: '【SASAERU】団体登録が承認されました',
        text: [
          `${p.toName} 様`,
          '',
          'SASAERUへのご登録が承認されました。',
          '',
          `団体名：${p.clubName}`,
          `承認日時：${p.approvedAt}`,
          '',
          '以下のURLから団体ページをご確認いただけます。',
          p.clubPageUrl,
          '',
          '引き続きSASAERUをよろしくお願いいたします。',
          '',
          'SASAERU 運営事務局',
        ].join('\n'),
      };

    // 否認メール
    case 'reject': {
      requireFields(p, ['toName']);
      requireEmail(p, 'toEmail');
      const reasonBlock = p.rejectReason
        ? [
            '─────────────────────────',
            `否認理由：${p.rejectReason}`,
            '─────────────────────────',
            '',
          ].join('\n')
        : '';
      return {
        from,
        to: p.toEmail,
        subject: '【SASAERU】団体登録について',
        text: [
          `${p.toName} 様`,
          '',
          'この度はSASAERUへのご登録申請、ありがとうございました。',
          '',
          '誠に恐れ入りますが、今回の申請については',
          '下記の理由により承認いたしかねる結果となりました。',
          '',
          reasonBlock,
          'ご不明な点がございましたら、お問い合わせください。',
          '',
          'SASAERU 運営事務局',
        ].join('\n'),
      };
    }

    // 問い合わせ通知（オーナー向け）
    case 'inquiry_owner':
      requireFields(p, ['orgName', 'companyName', 'picName']);
      requireEmail(p, 'toEmail');
      requireEmail(p, 'senderEmail');
      return {
        from,
        to: p.toEmail,
        cc: 'sasaeru@scl.or.jp',
        subject: `【SASAERU】${p.menuTitle ? `「${p.menuTitle}」に` : ''}お問い合わせがありました`,
        text: [
          `${p.orgName} 様`,
          '',
          '貴団体の支援メニューに対し、以下の企業様よりお問い合わせがありました。',
          '内容をご確認の上、直接ご返信をお願いいたします。',
          '',
          '■ お問い合わせ企業情報',
          `会社名：${p.companyName}`,
          `担当者：${p.picName} 様`,
          `メール：${p.senderEmail}`,
          p.phone ? `電話番号：${p.phone}` : null,
          '',
          '■ メッセージ',
          p.message || '（メッセージなし）',
          '',
          '─────────────────────────',
          '※ 本メールは送信専用です。',
          '─────────────────────────',
          '',
          'SASAERU 運営事務局',
        ].filter(l => l !== null).join('\n'),
      };

    // 問い合わせ自動返信（申請企業向け）
    case 'inquiry_reply':
      requireFields(p, ['companyName', 'picName', 'orgName']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        subject: '【SASAERU】お問い合わせを受け付けました',
        text: [
          `${p.companyName}`,
          `${p.picName} 様`,
          '',
          'SASAERUをご利用いただきありがとうございます。',
          '以下の内容でお問い合わせを受け付けました。',
          '',
          `対象団体　　：${p.orgName}`,
          p.menuTitle ? `対象メニュー：${p.menuTitle}` : null,
          '',
          '近日中に、対象団体の担当者より本メールアドレス宛にご連絡がございます。',
          '今しばらくお待ちください。',
          '',
          'SASAERU 運営事務局',
        ].filter(l => l !== null).join('\n'),
      };

    case 'admin_invite': {
      requireFields(p, ['toEmail', 'adminUrl', 'tempPassword']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        subject: '【SASAERU】管理者アカウントへのご招待',
        text: [
          'SASAERU管理ダッシュボードへのアクセス権が付与されました。',
          '',
          '以下の情報でログインしてください：',
          `ログインURL: ${p.adminUrl}`,
          `メールアドレス: ${p.toEmail}`,
          `仮パスワード: ${p.tempPassword}`,
          '',
          p.resetLink && p.resetLink !== p.adminUrl
            ? `または、以下のリンクからパスワードを設定することもできます：\n${p.resetLink}`
            : '',
          '',
          '【重要】初回ログイン後は必ずパスワードを変更してください。',
          'このメールに心当たりがない場合は、送信元にご連絡ください。',
          '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━',
          'SASAERU 運営事務局',
        ].filter(Boolean).join('\n'),
        html: `
          <div style="font-family:'Noto Sans JP',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
            <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px 40px;text-align:center">
              <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 20px">
                <span style="font-size:20px">♥</span>
                <span style="color:#fff;font-size:20px;font-weight:900;letter-spacing:0.5px">SASAERU</span>
              </div>
            </div>
            <div style="padding:40px">
              <h1 style="font-size:20px;font-weight:900;color:#0f172a;margin:0 0 8px">管理者アカウントへのご招待</h1>
              <p style="color:#64748b;font-size:14px;margin:0 0 28px">SASAERU管理ダッシュボードへのアクセス権が付与されました。</p>

              <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:20px;margin-bottom:24px">
                <p style="font-size:12px;font-weight:700;color:#9a3412;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">ログイン情報</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="font-size:12px;color:#64748b;padding:4px 0;white-space:nowrap;width:120px">ログインURL</td>
                    <td style="font-size:12px;color:#0f172a;font-weight:700;padding:4px 0">
                      <a href="${p.adminUrl}" style="color:#f97316;text-decoration:none">${p.adminUrl}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#64748b;padding:4px 0">メールアドレス</td>
                    <td style="font-size:12px;color:#0f172a;font-weight:700;padding:4px 0">${p.toEmail}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#64748b;padding:4px 0">仮パスワード</td>
                    <td style="font-size:14px;color:#0f172a;font-weight:900;padding:4px 0;letter-spacing:1px">${p.tempPassword}</td>
                  </tr>
                </table>
              </div>

              ${p.resetLink && p.resetLink !== p.adminUrl ? `
              <div style="text-align:center;margin-bottom:24px">
                <a href="${p.resetLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none">
                  パスワードを設定してログイン →
                </a>
              </div>` : `
              <div style="text-align:center;margin-bottom:24px">
                <a href="${p.adminUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none">
                  管理ダッシュボードへログイン →
                </a>
              </div>`}

              <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:24px">
                <p style="font-size:12px;color:#dc2626;font-weight:700;margin:0 0 6px">⚠️ 重要</p>
                <p style="font-size:12px;color:#7f1d1d;margin:0;line-height:1.6">
                  初回ログイン後は必ずパスワードを変更してください。<br>
                  このメールに心当たりがない場合は、送信元にご連絡ください。
                </p>
              </div>

              <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0">
                SASAERU 運営事務局 ｜ このメールは自動送信されています
              </p>
            </div>
          </div>`,
      };
    }

    default:
      throw clientError('Unknown email type');
  }
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // S-4 / H-6: CORS を許可オリジンに限定
  // ALLOWED_ORIGIN 未設定時は null を返してすべてのクロスオリジンリクエストを拒否（fail-closed）
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin = event.headers.origin || event.headers.Origin || '';
  let corsOrigin;
  if (allowedOrigins.length === 0) {
    // 未設定の場合は同オリジン（Netlify 内部）からのみ許可
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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (allowedOrigins.length > 0 && reqOrigin && !allowedOrigins.includes(reqOrigin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }

  // S-3: レート制限チェック
  // S-6: x-nf-client-connection-ip を優先（Netlify が付与する偽装不可の値）
  //      x-forwarded-for はクライアントが偽装可能なため補助的に使用
  const clientIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too Many Requests' }) };
  }

  if (!GMAIL_USER || !GMAIL_PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type, params } = body;
  if (!type || !params || typeof params !== 'object' || Array.isArray(params)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing type or params' }) };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = buildMailOptions(type, params);
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    if (e.code === 'validation/client') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }
    // S-7: 内部エラー詳細をクライアントに漏洩させない
    console.error('Send email error:', e.code || e.name || 'unknown');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'メール送信に失敗しました' }) };
  }
};
