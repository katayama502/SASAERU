const nodemailer = require('nodemailer');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || GMAIL_USER;
const EXTRA_ADMIN_EMAIL = process.env.EXTRA_ADMIN_EMAIL || 'sasaeru@scl.or.jp';
// 差出人・返信先として表示するアドレス（Gmail送信アカウントとは別に固定）
const MAIL_FROM_EMAIL = process.env.MAIL_FROM || 'sasaeru@scl.or.jp';

// 重複を除いた管理者宛先リスト（ADMIN_EMAIL と EXTRA_ADMIN_EMAIL が同じ場合は1件）
const ADMIN_TO = [...new Set([ADMIN_EMAIL, EXTRA_ADMIN_EMAIL].filter(Boolean))].join(', ');

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
// Slack 通知（admin_notify 用・非致命的）
// SLACK_WEBHOOK_URL が設定されている場合のみ送信。
// 失敗してもメール送信レスポンスには影響させない。
// ============================================================
async function notifySlack(label, lines) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  const text = [`📨 ${label}`, lines].filter(Boolean).join('\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error('Slack notify error:', e.name || 'unknown');
  } finally {
    clearTimeout(timer);
  }
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

  const from = `"SASAERU 運営事務局" <${MAIL_FROM_EMAIL}>`;

  switch (type) {

    // 管理者通知
    case 'admin_notify':
      requireFields(p, ['label', 'origin']);
      return {
        from,
        to: ADMIN_TO,
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
      requireFields(p, ['clubName', 'categoryJp', 'origin']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        cc: 'sasaeru@scl.or.jp',
        subject: '【SASAERU】 新規クラブ申請受付メール',
        text: [
          `${p.clubName} 様`,
          'こんにちは！',
          'SASAERUの運営会社である一般社団法人しまね創生ラボの藤田です。',
          'この度はクラブ登録をご検討いただきありがとうございます。',
          '',
          '申請を以下の内容にて受け付けました。',
          '',
          '=================',
          `クラブ名：${p.clubName}`,
          `カテゴリ：${p.categoryJp}`,
          `エリア：${p.areaJp || ''}`,
          '=================',
          '',
          '公開には審査が必要ですので、審査完了まで今しばらくお待ちください。',
          '審査結果はメールにてお知らせします。',
          '----------------------------------------',
          '～未来をつくろう～',
          '一般社団法人しまね創生ラボ',
          '代表理事　藤田　優太朗',
          '',
          'MAIL: sasaeru@scl.or.jp',
          'TEL: 080-9332-9255',
          'ADD: 〒690-0842',
          '　島根県松江市東本町２丁目２５－１',
          '　東本町ビル４階',
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

    // 新規支援メニュー登録完了メール（クラブ向け）
    case 'menu_created':
      requireFields(p, ['orgName', 'menuTitle', 'targetAmount']);
      requireEmail(p, 'toEmail');
      return {
        from,
        to: p.toEmail,
        cc: 'sasaeru@scl.or.jp',
        subject: '【SASAERU】 新規支援メニュー登録完了メール',
        text: [
          `${p.orgName} 様`,
          'こんにちは！',
          'SASAERUの運営会社である一般社団法人しまね創生ラボの藤田です。',
          'この度は支援メニューを登録いただきありがとうございます。',
          '',
          '以下の内容にて公式サイトにて公開しております。',
          '=================',
          `団体名：${p.orgName}`,
          `メニュー名：${p.menuTitle}`,
          `希望金額・数量：${p.targetAmount || ''}`,
          '=================',
          '公式サイト：https://sasaeru.scl.or.jp/',
          '',
          '積極的に広報して、支援を呼びかけましょう！',
          '----------------------------------------',
          '～未来をつくろう～',
          '一般社団法人しまね創生ラボ',
          '代表理事　藤田　優太朗',
          '',
          'MAIL: sasaeru@scl.or.jp',
          'TEL: 080-9332-9255',
          'ADD: 〒690-0842',
          '　島根県松江市東本町２丁目２５－１',
          '　東本町ビル４階',
        ].join('\n'),
      };

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

    default:
      throw clientError('Unknown email type');
  }
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  // S-4 / H-6: CORS を許可オリジンに限定
  // ALLOWED_ORIGIN 未設定時は本番オリジンのみ許可（fail-closed）
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'https://sasaeru.netlify.app').split(',').map(s => s.trim()).filter(Boolean);
  const reqOrigin = event.headers.origin || event.headers.Origin || '';
  const corsOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : 'null';

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
  // Origin ヘッダーがあり許可リスト外なら拒否（Origin なしのサーバー間リクエストは許可）
  if (reqOrigin && !allowedOrigins.includes(reqOrigin)) {
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
    // 返信先を運営事務局アドレスに固定（Gmail が From を書き換えても返信は届く）
    if (!mailOptions.replyTo) mailOptions.replyTo = MAIL_FROM_EMAIL;
    await transporter.sendMail(mailOptions);

    // 管理者通知はメール送信成功後に Slack へも通知（失敗しても 200 を返す）
    if (type === 'admin_notify') {
      await notifySlack(
        sanitize(params.label, 500),
        sanitize(params.lines, 2000, true),
      );
    }

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
