/**
 * set-first-admin Netlify Function テスト
 * - 一度きりのブートストラップガード（admins コレクション非空 → 410）
 * - シークレット検証
 * - Firebase Admin / Firestore モック
 */

'use strict';

// ── 環境変数はモジュールロード前に設定する ──────────────────────────────
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'test' });
process.env.ADMIN_BOOTSTRAP_SECRET   = 'bootstrap-secret-123';
process.env.ALLOWED_ORIGIN           = 'https://sasaeru.netlify.app';

// ── Firebase Admin モック ────────────────────────────────────────────
const mockLimitGet            = jest.fn();
const mockDocSet              = jest.fn().mockResolvedValue({});
const mockGetUserByEmail      = jest.fn();
const mockSetCustomUserClaims = jest.fn().mockResolvedValue({});

jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => ({
    collection: jest.fn(() => ({
      limit: jest.fn(() => ({ get: mockLimitGet })),
      doc:   jest.fn(() => ({ set: mockDocSet })),
    })),
  }));
  firestore.FieldValue = { serverTimestamp: jest.fn(() => 'server-ts') };
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    auth: jest.fn(() => ({
      getUserByEmail:      mockGetUserByEmail,
      setCustomUserClaims: mockSetCustomUserClaims,
    })),
    firestore,
  };
});

const { handler } = require('../../netlify/functions/set-first-admin/index.js');

// ── レート制限（3回/60秒）を回避するためにテストごとに一意IPを使う ──────
let _ipCounter = 2000;
function nextIp() {
  return `192.168.${Math.floor(_ipCounter / 256) % 256}.${_ipCounter++ % 256}`;
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
      email:  'first-admin@example.com',
      secret: 'bootstrap-secret-123',
    }),
    ...overrides,
  };
}

beforeEach(() => {
  mockLimitGet.mockClear();
  mockDocSet.mockClear();
  mockGetUserByEmail.mockClear();
  mockSetCustomUserClaims.mockClear();
  // デフォルト: admins コレクションは空（初回ブートストラップ可能）
  mockLimitGet.mockResolvedValue({ empty: true });
  mockGetUserByEmail.mockResolvedValue({ uid: 'uid-first-admin' });
});

// ════════════════════════════════════════════════════════════════════
// 1. ブートストラップガード
// ════════════════════════════════════════════════════════════════════
describe('一度きりのブートストラップガード', () => {
  test('admins コレクションが非空 → 410 で権限付与しない', async () => {
    mockLimitGet.mockResolvedValue({ empty: false });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.body).error).toBe('既に管理者が初期化されています');
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  test('admins コレクションが空 → 200 で管理者を付与', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.uid).toBe('uid-first-admin');
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('uid-first-admin', { admin: true });
    expect(mockDocSet).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. シークレット・入力検証
// ════════════════════════════════════════════════════════════════════
describe('シークレット・入力検証', () => {
  test('secret 不一致 → 403', async () => {
    const res = await handler(makeEvent({
      headers: {
        'content-type': 'application/json',
        origin: 'https://sasaeru.netlify.app',
        'x-nf-client-connection-ip': nextIp(),
      },
      body: JSON.stringify({ email: 'first-admin@example.com', secret: 'wrong-secret' }),
    }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Invalid secret');
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  test('不正な email → 400', async () => {
    const res = await handler(makeEvent({
      headers: {
        'content-type': 'application/json',
        origin: 'https://sasaeru.netlify.app',
        'x-nf-client-connection-ip': nextIp(),
      },
      body: JSON.stringify({ email: 'not-an-email', secret: 'bootstrap-secret-123' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid email');
  });

  test('GET → 405', async () => {
    const res = await handler(makeEvent({ httpMethod: 'GET' }));
    expect(res.statusCode).toBe(405);
  });

  test('許可外 Origin → 403', async () => {
    const res = await handler(makeEvent({
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
        'x-nf-client-connection-ip': nextIp(),
      },
    }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Forbidden origin');
  });
});
