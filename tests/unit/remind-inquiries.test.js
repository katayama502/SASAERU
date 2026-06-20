/**
 * remind-inquiries Netlify Function テスト
 * - 実行ガード（スケジュール起動 or x-remind-secret ヘッダーのみ許可）
 * - Firebase Admin / nodemailer モック
 */

'use strict';

// ── 環境変数はモジュールロード前に設定する ──────────────────────────────
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'test' });
process.env.GMAIL_USER               = 'sender@gmail.com';
process.env.GMAIL_APP_PASSWORD       = 'app-password';
process.env.REMIND_SECRET            = 'remind-secret-456';

// ── Firebase Admin モック ────────────────────────────────────────────
const mockInquiriesGet = jest.fn();

jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({ get: mockInquiriesGet })),
      doc:   jest.fn(() => ({ get: jest.fn(), update: jest.fn() })),
    })),
    batch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn().mockResolvedValue({}) })),
  }));
  firestore.FieldValue = { serverTimestamp: jest.fn(() => 'server-ts') };
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    firestore,
  };
});

// ── nodemailer モック ────────────────────────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'remind-id' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const { handler } = require('../../netlify/functions/remind-inquiries/index.js');

beforeEach(() => {
  mockInquiriesGet.mockClear();
  mockSendMail.mockClear();
  // デフォルト: 未対応の問い合わせなし
  mockInquiriesGet.mockResolvedValue({ docs: [] });
});

// ════════════════════════════════════════════════════════════════════
// 1. 実行ガード
// ════════════════════════════════════════════════════════════════════
describe('実行ガード', () => {
  test('secret もスケジュールペイロードもない → 403', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: '' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Forbidden');
    expect(mockInquiriesGet).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('GET（body なし） → 403', async () => {
    const res = await handler({ httpMethod: 'GET', headers: {}, body: null });
    expect(res.statusCode).toBe(403);
    expect(mockInquiriesGet).not.toHaveBeenCalled();
  });

  test('x-remind-secret が不一致 → 403', async () => {
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-remind-secret': 'wrong-secret' },
      body: '',
    });
    expect(res.statusCode).toBe(403);
    expect(mockInquiriesGet).not.toHaveBeenCalled();
  });

  test('REMIND_SECRET 未設定時はヘッダーがあっても 403', async () => {
    const orig = process.env.REMIND_SECRET;
    delete process.env.REMIND_SECRET;

    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-remind-secret': '' },
      body: '',
    });
    expect(res.statusCode).toBe(403);
    expect(mockInquiriesGet).not.toHaveBeenCalled();

    process.env.REMIND_SECRET = orig;
  });

  test('スケジュール起動（body に next_run） → 実行される', async () => {
    const res = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ next_run: '2026-06-15T00:00:00.000Z' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).reminded).toBe(0);
    expect(mockInquiriesGet).toHaveBeenCalledTimes(1);
  });

  test('正しい x-remind-secret → 実行される', async () => {
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-remind-secret': 'remind-secret-456' },
      body: '',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).reminded).toBe(0);
    expect(mockInquiriesGet).toHaveBeenCalledTimes(1);
  });
});
