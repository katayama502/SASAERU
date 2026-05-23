/**
 * send-email Netlify Function テスト
 * - sanitize()
 * - isRateLimited()
 * - buildMailOptions()
 * - handler() レスポンスコード
 */

'use strict';

// ── 環境変数はモジュールロード前に設定する（index.js が const GMAIL_USER = process.env.GMAIL_USER をトップレベルで読む） ──
process.env.GMAIL_USER         = 'test@gmail.com';
process.env.GMAIL_APP_PASSWORD = 'testpassword';
process.env.ALLOWED_ORIGIN     = 'https://sasaeru.netlify.app';
process.env.ADMIN_EMAIL        = 'admin@example.com';

// ── nodemailer をモック（jest.mock はファイル先頭にホイストされる） ──────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

// ── テスト対象をモック登録後に require ─────────────────────────────────
const { handler } = require('../../netlify/functions/send-email/index.js');

// ── レート制限を回避するためにテストごとに一意IPを使う ──────────────────
let _ipCounter = 0;
function nextIp() {
  return `10.0.${Math.floor(_ipCounter / 256)}.${_ipCounter++ % 256}`;
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
      type: 'admin_notify',
      params: {
        label: 'テスト',
        lines: 'line1\nline2',
        origin: 'https://sasaeru.netlify.app',
      },
    }),
    ...overrides,
  };
}

beforeEach(() => {
  mockSendMail.mockClear();
});

// ════════════════════════════════════════════════════════════════════
// 1. HTTP メソッド検証
// ════════════════════════════════════════════════════════════════════
describe('HTTP メソッド検証', () => {
  test('OPTIONS → 204 (CORS プリフライト)', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(res.statusCode).toBe(204);
  });

  test('GET → 405 Method Not Allowed', async () => {
    const res = await handler(makeEvent({ httpMethod: 'GET' }));
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toBe('Method Not Allowed');
  });

  test('PUT → 405 Method Not Allowed', async () => {
    const res = await handler(makeEvent({ httpMethod: 'PUT' }));
    expect(res.statusCode).toBe(405);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. リクエストボディ検証
// ════════════════════════════════════════════════════════════════════
describe('リクエストボディ検証', () => {
  test('不正なJSONボディ → 400', async () => {
    const res = await handler(makeEvent({ body: '{invalid json' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid JSON');
  });

  test('type が欠落 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ params: { label: 'x' } }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Missing type or params');
  });

  test('params が欠落 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ type: 'admin_notify' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Missing type or params');
  });

  test('params がオブジェクト以外 → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ type: 'admin_notify', params: [] }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Missing type or params');
  });

  test('空ボディ → 400 (type/params欠落)', async () => {
    const res = await handler(makeEvent({ body: '' }));
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. 各メールタイプの正常送信
// ════════════════════════════════════════════════════════════════════
describe('メールタイプ別 正常送信 (200)', () => {
  const origin = 'https://sasaeru.netlify.app';

  test('admin_notify → 200', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'admin_notify',
        params: { label: '🏃 新規クラブ申請', lines: '団体名: テスト団体\n地域: 松江市', origin },
      }),
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('admin@example.com');
    expect(mail.subject).toContain('🏃 新規クラブ申請');
  });

  test('applicant → 200 (登録受付メール)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'applicant',
        params: {
          toEmail: 'club@example.com',
          clubName: '松江FC',
          categoryJp: 'スポーツ',
          registeredAt: '2026-05-15',
          origin,
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('club@example.com');
    expect(mail.subject).toBe('【SASAERU】団体登録を受け付けました');
    expect(mail.text).toContain('松江FC');
    expect(mail.text).toContain('スポーツ');
  });

  test('approve → 200 (承認メール)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'approve',
        params: {
          toEmail: 'club@example.com',
          toName: '田中太郎',
          clubName: '松江FC',
          approvedAt: '2026-05-15',
          clubPageUrl: `${origin}/club.html?id=abc123`,
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('club@example.com');
    expect(mail.subject).toBe('【SASAERU】団体登録が承認されました');
    expect(mail.text).toContain('田中太郎');
  });

  test('reject → 200 (否認メール・理由あり)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'reject',
        params: {
          toEmail: 'club@example.com',
          toName: '田中太郎',
          rejectReason: '活動実績が確認できませんでした',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain('活動実績が確認できませんでした');
  });

  test('reject → 200 (否認メール・理由なし)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'reject',
        params: { toEmail: 'club@example.com', toName: '田中太郎' },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).not.toContain('否認理由');
  });

  test('inquiry_owner → 200 (オーナー通知)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'inquiry_owner',
        params: {
          toEmail: 'owner@example.com',
          orgName: '松江FC',
          menuTitle: '遠征費支援',
          companyName: '株式会社テスト',
          picName: '山田花子',
          senderEmail: 'yamada@example.com',
          phone: '090-1234-5678',
          message: 'ご支援に興味があります',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('owner@example.com');
    expect(mail.subject).toContain('遠征費支援');
    expect(mail.text).toContain('株式会社テスト');
  });

  test('inquiry_owner → phone が未指定のとき電話番号行を除外', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'inquiry_owner',
        params: {
          toEmail: 'owner@example.com',
          orgName: '松江FC',
          menuTitle: '遠征費支援',
          companyName: '株式会社テスト',
          picName: '山田花子',
          senderEmail: 'yamada@example.com',
          message: 'メッセージ',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).not.toContain('電話番号');
  });

  test('inquiry_reply → 200 (企業向け自動返信)', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'inquiry_reply',
        params: {
          toEmail: 'company@example.com',
          companyName: '株式会社テスト',
          picName: '山田花子',
          orgName: '松江FC',
          menuTitle: '遠征費支援',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('company@example.com');
    expect(mail.subject).toBe('【SASAERU】お問い合わせを受け付けました');
  });

  test('未知のタイプ → 400', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({ type: 'unknown_type', params: {} }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid request');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. GMAIL 設定未設定時 (モジュール再ロードが必要なため isolateModules)
// ════════════════════════════════════════════════════════════════════
describe('環境変数未設定', () => {
  test('GMAIL_USER 未設定 → 500', async () => {
    let res;
    jest.isolateModules(() => {
      const orig = process.env.GMAIL_USER;
      delete process.env.GMAIL_USER;
      const { handler: h } = require('../../netlify/functions/send-email/index.js');
      // isolateModules はコールバック内の require だけ分離
      res = h(makeEvent());
      process.env.GMAIL_USER = orig;
    });
    const result = await res;
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Email not configured');
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. レート制限 (5回/60秒)
// ════════════════════════════════════════════════════════════════════
describe('レート制限 (5回/60秒)', () => {
  test('同一IPから6回目のリクエストで 429', async () => {
    const fixedIp = '99.99.99.99';

    // 新しいモジュールインスタンス（_rateMap をリセット）でテスト
    let h;
    jest.isolateModules(() => {
      h = require('../../netlify/functions/send-email/index.js').handler;
    });

    const makeRateEvent = () => ({
      httpMethod: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://sasaeru.netlify.app',
        'x-nf-client-connection-ip': fixedIp,
      },
      body: JSON.stringify({
        type: 'admin_notify',
        params: { label: 'test', lines: 'line', origin: 'https://sasaeru.netlify.app' },
      }),
    });

    // 5回まで通過（200 または 500 だが 429 ではない）
    for (let i = 0; i < 5; i++) {
      const r = await h(makeRateEvent());
      expect(r.statusCode).not.toBe(429);
    }
    // 6回目はブロック
    const blocked = await h(makeRateEvent());
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).error).toBe('Too Many Requests');
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. CORS ヘッダー
// ════════════════════════════════════════════════════════════════════
describe('CORS ヘッダー', () => {
  test('許可オリジンのリクエスト → Access-Control-Allow-Origin に同値', async () => {
    const res = await handler(makeEvent());
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://sasaeru.netlify.app');
  });

  test('レスポンスに X-Content-Type-Options: nosniff が含まれる', async () => {
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
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. 入力サニタイズ（セキュリティ検証）
// ════════════════════════════════════════════════════════════════════
describe('入力サニタイズ（ヘッダーインジェクション防止）', () => {
  test('改行を含む subject パラメータがサニタイズされ送信される', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'admin_notify',
        params: {
          label: 'test\r\nBcc: evil@evil.com',
          lines: 'line1',
          origin: 'https://sasaeru.netlify.app',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    // 改行が除去されていること
    expect(mail.subject).not.toContain('\r\n');
    expect(mail.subject).not.toContain('\n');
  });

  test('500文字超えのパラメータが切り詰められる', async () => {
    const longStr = 'a'.repeat(1000);
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'admin_notify',
        params: { label: longStr, lines: 'line', origin: 'https://sasaeru.netlify.app' },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    // subject = "【SASAERU】" + label(500文字以内)
    expect(mail.subject.length).toBeLessThanOrEqual(520);
  });

  test('lines フィールドは改行を保持する', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'admin_notify',
        params: {
          label: 'テスト',
          lines: '行1\n行2\n行3',
          origin: 'https://sasaeru.netlify.app',
        },
      }),
    }));
    expect(res.statusCode).toBe(200);
    const mail = mockSendMail.mock.calls[0][0];
    // lines の改行は本文整形で保持される
    expect(mail.text).toContain('行1\n行2\n行3');
  });

  test('宛先メールアドレスに改行を含む場合は 400 で送信しない', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'applicant',
        params: {
          toEmail: 'club@example.com\r\nbcc: attacker@example.com',
          clubName: '松江FC',
          categoryJp: 'スポーツ',
          registeredAt: '2026-05-15',
          origin: 'https://sasaeru.netlify.app',
        },
      }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid request');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('必須項目不足の場合は 400 で送信しない', async () => {
    const res = await handler(makeEvent({
      body: JSON.stringify({
        type: 'approve',
        params: {
          toEmail: 'club@example.com',
          toName: '田中太郎',
          clubName: '松江FC',
          approvedAt: '2026-05-15',
        },
      }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid request');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. メール本文の内容検証
// ════════════════════════════════════════════════════════════════════
describe('メール本文の内容検証', () => {
  const origin = 'https://sasaeru.netlify.app';

  test('applicant メールに重要事項（メール確認の案内）が含まれる', async () => {
    await handler(makeEvent({
      body: JSON.stringify({
        type: 'applicant',
        params: { toEmail: 'club@example.com', clubName: '出雲SC', categoryJp: '文化', registeredAt: '2026-05-15', origin },
      }),
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain('メールアドレスの確認');
  });

  test('approve メールに団体ページURLが含まれる', async () => {
    const url = `${origin}/club.html?id=test123`;
    await handler(makeEvent({
      body: JSON.stringify({
        type: 'approve',
        params: { toEmail: 'e@example.com', toName: '山田', clubName: 'FC', approvedAt: '2026-05-15', clubPageUrl: url },
      }),
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain(url);
  });

  test('inquiry_reply メールに団体名・メニュー名が含まれる', async () => {
    await handler(makeEvent({
      body: JSON.stringify({
        type: 'inquiry_reply',
        params: {
          toEmail: 'c@example.com', companyName: '会社A', picName: '担当者',
          orgName: '島根FC', menuTitle: 'ユニフォーム代支援',
        },
      }),
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain('島根FC');
    expect(mail.text).toContain('ユニフォーム代支援');
  });

  test('admin_notify メールに管理画面URLが含まれる', async () => {
    await handler(makeEvent({
      body: JSON.stringify({
        type: 'admin_notify',
        params: { label: 'テスト通知', lines: 'line', origin },
      }),
    }));
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.text).toContain(`${origin}/admin.html`);
  });
});
