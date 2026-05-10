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
// ============================================================
function sanitize(val, maxLen = 500) {
  if (val == null) return '';
  return String(val)
    .replace(/[\r\n]/g, ' ')   // 改行をスペースに置換
    .replace(/[^\S ]/g, ' ')   // タブ等制御文字を除去
    .trim()
    .slice(0, maxLen);
}

// ============================================================
// Gmail トランスポーター
// ============================================================
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
  });
}

// ============================================================
// メールオプション生成
// ============================================================
function buildMailOptions(type, rawParams) {
  // 全パラメータをサニタイズ
  const p = {};
  for (const [k, v] of Object.entries(rawParams || {})) {
    p[k] = sanitize(v, k === 'message' || k === 'lines' ? 2000 : 500);
  }

  const from = `"SASAERU 運営事務局" <${GMAIL_USER}>`;

  switch (type) {

    // 管理者通知
    case 'admin_notify':
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
          '現在、運営事務局にて内容を確認しております。',
          '審査が完了次第、改めてご連絡いたします。',
          '',
          '今しばらくお待ちください。',
          '',
          'SASAERU 運営事務局',
        ].join('\n'),
      };

    // 承認メール
    case 'approve':
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
      return {
        from,
        to: p.toEmail,
        subject: `【SASAERU】「${p.menuTitle}」にお問い合わせがありました`,
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
          `対象メニュー：${p.menuTitle}`,
          '',
          '近日中に、対象団体の担当者より本メールアドレス宛にご連絡がございます。',
          '今しばらくお待ちください。',
          '',
          'SASAERU 運営事務局',
        ].join('\n'),
      };

    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // S-4: CORS を許可オリジンに限定
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin = event.headers.origin || event.headers.Origin || '';
  const corsOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(reqOrigin)
    ? (reqOrigin || '*')
    : allowedOrigins[0];

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

  // S-3: レート制限チェック
  const clientIp = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['x-nf-client-connection-ip']
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
  if (!type || !params) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing type or params' }) };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = buildMailOptions(type, params);
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('Send email error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
