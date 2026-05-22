/**
 * send-verify-email Netlify Function テスト
 * - レート制限
 * - 入力バリデーション
 * - Firebase Admin / nodemailer モック
 * - 各エラーコードの正しいHTTPレスポンス
 */

'use strict';

// ── 環境変数はモジュールロード前に設定する ──────────────────────────────
process.env.GMAIL_USER               = 'sender@gmail.com';
process.env.GMAIL_APP_PASSWORD       = 'app-password';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'test' });
process.env.ALLOWED_ORIGIN           = 'https://sasaeru.netlify.app';

// ── Firebase Admin モック ────────────────────────────────────────────
const mockGenerateLink = jest.fn();
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: jest.fn(() => ({
    generateEmailVerificationLink: mockGenerateLink,
  })),
}));

// ── nodemailer モック ────────────────────────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'verify-id' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const { handler } = require('../../netlify/functions/send-verify-email/index.js');

// ── レート制限を回避するためにテストごとに一意IPを使う ──────────────────
let _ipCounter = 1000;
function nextIp() {
  return `172.16.${Math.floor(_ipCounter / 256)}.${_ipCounter++ % 256}`;
}

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://sasaeru.netlify.app',
      'x-nf-client-connection-ip': nextIp(),
    },
    body: JSON.stringify({
      email: 'user@example.com',
      origin: 'https://sasaeru.netlify.app',
    }),
    ...overrides,
  };
}

beforeEach(() => {
  mockSendMail.mockClear();
  mockGenerateLink.mockClear();
  // デフォルトの成功動作を設定
  mockGenerateLink.mockResolvedValue('https://firebase.example.com/verify?oobCode=abc123');
});

// ════════════════════════════════════════════════════════════════════
// 1. HTTP メソッド検証
// ════════════════════════════════════════════════════════════════════
describe('HTTP メソッド検証', () => {
  test('OPTIONS → 204', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(res.statusCode).toBe(204);
  });

  test('GET → 405', async () => {
    const res = await handler(makeEvent({ httpMethod: 'GET' }));
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toBe('Method Not Allowed');
  });

  test('DELETE → 405', async () => {
    const res = await handler(makeEvent({ httpMethod: 'DELETE' }));
    expect(res.statusCode).toBe(405);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. メール送信正常系
// ════════════════════════════════════════════════════════════════════
describe('正常系: メール確認リンク送信', () => {
  test('有効なリクエスト → 200 { ok: true }', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('generateEmailVerificationLink に正しい引数が渡される', async () => {
    await handler(makeEvent({
      body: JSON.stringify({ email: 'user@example.com', origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(mockGenerateLink).toHaveBeenCalledWith(
      'user@example.com',
      { url: 'https://sasaeru.netlify.app/mypage.html' }
    );
  });

  test('送信メールの宛先・件名が正しい', async () => {
    await handler(makeEvent({
      body: JSON.stringify({ email: 'club@example.com', origin: 'https://sasaeru.netlify.app' }),
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('club@example.com');
    expect(mail.subject).toBe('【SASAERU】メールアドレスの確認をお願いします');
  });

  test('メール本文に確認リンクが含まれる', async () => {
    await handler(makeEvent());
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain('https://firebase.example.com/verify?oobCode=abc123');
  });

  test('メール本文に24時間有効の案内が含まれる', async () => {
    await handler(makeEvent());
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain('24時間');
  });

  test('メール前後のスペースはtrimされる', async () => {
    await handler(makeEvent({
      body: JSON.stringify({ email: '  trimme@example.com  ', origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(mockGenerateLink).toHaveBeenCalledWith(
      'trimme@example.com',
      expect.any(Object)
    );
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('trimme@example.com');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. 入力バリデーション
// ════════════════════════════════════════════════════════════════════
describe('入力バリデーション', () => {
  test('email 欠落 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid email');
  });

  test('@なしのメールアドレス → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ email: 'notanemail', origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid email');
  });

  test('email が数値型 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ email: 12345, origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid email');
  });

  test('email が空文字 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ email: '', origin: 'https://sasaeru.netlify.app' }),
    }));
    expect(res.statusCode).toBe(400);
  });

  test('改行を含むメールアドレス → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        email: 'user@example.com\r\nbcc: attacker@example.com',
        origin: 'https://sasaeru.netlify.app',
      }),
    }));
    expect(res.statusCode).toBe(400);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('不正なJSON → 400', async () => {
    const res = await handler(makeEvent({ body: '{bad json' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid JSON');
  });

  test('body が null → 400 または通常ハンドリング', async () => {
    const res = await handler(makeEvent({ body: null }));
    // null body は {} として扱われる → email 欠落で 400
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. Firebase エラーハンドリング
// ════════════════════════════════════════════════════════════════════
describe('Firebase エラーハンドリング', () => {
  test('auth/user-not-found → 404', async () => {
    const err = new Error('user not found');
    err.code = 'auth/user-not-found';
    mockGenerateLink.mockRejectedValueOnce(err);

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('user-not-found');
  });

  test('auth/email-already-verified → 409', async () => {
    const err = new Error('already verified');
    err.code = 'auth/email-already-verified';
    mockGenerateLink.mockRejectedValueOnce(err);

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('already-verified');
  });

  test('その他の Firebase エラー → 500', async () => {
    const err = new Error('internal error');
    err.code = 'auth/internal-error';
    mockGenerateLink.mockRejectedValueOnce(err);

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });

  test('Gmail 送信エラー → 500', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });

  test('エラー時に内部エラー詳細がクライアントに漏洩しない', async () => {
    const err = new Error('DB_PASSWORD=secret123');
    err.code = 'auth/internal-error';
    mockGenerateLink.mockRejectedValueOnce(err);

    const res = await handler(makeEvent());
    expect(JSON.parse(res.body).error).not.toContain('DB_PASSWORD');
    expect(JSON.parse(res.body).error).not.toContain('secret123');
  });

  test('エラー時に内部エラー詳細をログへ出さない', async () => {
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('DB_PASSWORD=secret123');
    err.code = 'auth/internal-error';
    mockGenerateLink.mockRejectedValueOnce(err);

    await handler(makeEvent());
    const logs = logSpy.mock.calls.flat().join(' ');
    expect(logs).not.toContain('DB_PASSWORD');
    expect(logs).not.toContain('secret123');
    logSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. 環境変数未設定
// ════════════════════════════════════════════════════════════════════
describe('環境変数未設定', () => {
  test('FIREBASE_SERVICE_ACCOUNT 未設定 → 500', async () => {
    const orig = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;

    let res;
    jest.isolateModules(() => {
      jest.mock('firebase-admin', () => ({
        apps: [],
        initializeApp: jest.fn(),
        credential: { cert: jest.fn() },
        auth: jest.fn(() => ({ generateEmailVerificationLink: jest.fn() })),
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
      }));
      const { handler: h } = require('../../netlify/functions/send-verify-email/index.js');
      res = h(makeEvent());
    });
    const result = await res;
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Firebase not configured');

    process.env.FIREBASE_SERVICE_ACCOUNT = orig;
  });

  test('GMAIL_USER 未設定 → 500', async () => {
    const orig = process.env.GMAIL_USER;
    delete process.env.GMAIL_USER;

    let res;
    jest.isolateModules(() => {
      jest.mock('firebase-admin', () => ({
        apps: [],
        initializeApp: jest.fn(),
        credential: { cert: jest.fn() },
        auth: jest.fn(() => ({ generateEmailVerificationLink: jest.fn() })),
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
      }));
      const { handler: h } = require('../../netlify/functions/send-verify-email/index.js');
      res = h(makeEvent());
    });
    const result = await res;
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Email not configured');

    process.env.GMAIL_USER = orig;
  });

  test('FIREBASE_SERVICE_ACCOUNT が不正JSON → 500', async () => {
    const orig = process.env.FIREBASE_SERVICE_ACCOUNT;
    process.env.FIREBASE_SERVICE_ACCOUNT = '{bad json';

    let res;
    jest.isolateModules(() => {
      jest.mock('firebase-admin', () => ({
        apps: [],
        initializeApp: jest.fn(),
        credential: { cert: jest.fn() },
        auth: jest.fn(() => ({ generateEmailVerificationLink: jest.fn() })),
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
      }));
      const { handler: h } = require('../../netlify/functions/send-verify-email/index.js');
      res = h(makeEvent());
    });
    const result = await res;
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Firebase not configured');

    process.env.FIREBASE_SERVICE_ACCOUNT = orig;
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. レート制限 (3回/60秒)
// ════════════════════════════════════════════════════════════════════
describe('レート制限 (3回/60秒)', () => {
  test('同一IPから4回目のリクエストで 429', async () => {
    const fixedIp = '88.88.88.88';

    let h;
    jest.isolateModules(() => {
      jest.mock('firebase-admin', () => ({
        apps: [],
        initializeApp: jest.fn(),
        credential: { cert: jest.fn() },
        auth: jest.fn(() => ({
          generateEmailVerificationLink: jest.fn().mockResolvedValue('https://link.example.com'),
        })),
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
      }));
      h = require('../../netlify/functions/send-verify-email/index.js').handler;
    });

    const makeRateEvent = () => ({
      httpMethod: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://sasaeru.netlify.app',
        'x-nf-client-connection-ip': fixedIp,
      },
      body: JSON.stringify({ email: 'test@example.com', origin: 'https://sasaeru.netlify.app' }),
    });

    // 3回まで通過
    for (let i = 0; i < 3; i++) {
      const r = await h(makeRateEvent());
      expect(r.statusCode).not.toBe(429);
    }
    // 4回目はブロック
    const blocked = await h(makeRateEvent());
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).error).toBe('Too Many Requests');
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. CORS ヘッダー
// ════════════════════════════════════════════════════════════════════
describe('CORS ヘッダー', () => {
  test('許可オリジン → Access-Control-Allow-Origin に反映', async () => {
    const res = await handler(makeEvent());
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://sasaeru.netlify.app');
  });

  test('X-Content-Type-Options: nosniff', async () => {
    const res = await handler(makeEvent());
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  test('Access-Control-Allow-Methods に POST が含まれる', async () => {
    const res = await handler(makeEvent());
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  test('許可外OriginのPOST → 403 かつ送信しない', async () => {
    const res = await handler(makeEvent({
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
        'x-nf-client-connection-ip': nextIp(),
      },
    }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Forbidden origin');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('null');
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. オリジンホワイトリスト検証
// ════════════════════════════════════════════════════════════════════
describe('origin ホワイトリスト検証', () => {
  test('不正オリジンが body に含まれても許可オリジンが使用される', async () => {
    await handler(makeEvent({
      body: JSON.stringify({
        email: 'user@example.com',
        origin: 'https://evil.example.com',
      }),
    }));

    const callArg = mockGenerateLink.mock.calls[0][1];
    expect(callArg.url).not.toContain('evil.example.com');
    expect(callArg.url).toContain('sasaeru.netlify.app');
  });

  test('mypage.html にリダイレクトされる', async () => {
    await handler(makeEvent());
    const callArg = mockGenerateLink.mock.calls[0][1];
    expect(callArg.url).toContain('/mypage.html');
  });
});
