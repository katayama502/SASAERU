const nodemailer = require('nodemailer');

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || GMAIL_USER;

// ============================================================
// Gmail トランスポーター
// ============================================================
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASSWORD,
    },
  });
}

// ============================================================
// メールオプション生成
// ============================================================
function buildMailOptions(type, params) {
  const from = `"SASAERU 運営事務局" <${GMAIL_USER}>`;

  switch (type) {

    // 管理者通知
    case 'admin_notify':
      return {
        from,
        to: ADMIN_EMAIL,
        subject: `【SASAERU】${params.label}`,
        text: [
          params.label,
          '',
          params.lines,
          '',
          `🔗 管理画面: ${params.origin}/admin.html`,
        ].join('\n'),
      };

    // 登録受付メール（申請者向け）
    case 'applicant':
      return {
        from,
        to: params.toEmail,
        subject: '【SASAERU】団体登録を受け付けました',
        text: [
          `${params.clubName} 様`,
          '',
          'この度はSASAERUにご登録いただきありがとうございます。',
          '',
          '以下の内容で申請を受け付けました。',
          '─────────────────────────',
          `団体名：${params.clubName}`,
          `カテゴリ：${params.categoryJp}`,
          `受付日時：${params.registeredAt}`,
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
        to: params.toEmail,
        subject: '【SASAERU】団体登録が承認されました',
        text: [
          `${params.toName} 様`,
          '',
          'SASAERUへのご登録が承認されました。',
          '',
          `団体名：${params.clubName}`,
          `承認日時：${params.approvedAt}`,
          '',
          '以下のURLから団体ページをご確認いただけます。',
          params.clubPageUrl,
          '',
          '引き続きSASAERUをよろしくお願いいたします。',
          '',
          'SASAERU 運営事務局',
        ].join('\n'),
      };

    // 否認メール
    case 'reject': {
      const reasonBlock = params.rejectReason
        ? [
            '─────────────────────────',
            `否認理由：${params.rejectReason}`,
            '─────────────────────────',
            '',
          ].join('\n')
        : '';
      return {
        from,
        to: params.toEmail,
        subject: '【SASAERU】団体登録について',
        text: [
          `${params.toName} 様`,
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

    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

// ============================================================
// ハンドラー
// ============================================================
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!GMAIL_USER || !GMAIL_PASSWORD) {
    console.error('GMAIL_USER or GMAIL_APP_PASSWORD is not set');
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
    console.log(`Email sent: type=${type} to=${mailOptions.to}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('Send email error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
