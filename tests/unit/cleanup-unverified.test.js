/**
 * cleanup-unverified Netlify Function テスト
 * - 実行ガード（スケジュール起動 or x-cleanup-secret ヘッダーのみ許可）
 * - 期限（7日）・メール確認状態による削除対象の判定
 * - dryRun / 削除失敗時の挙動
 */

'use strict';

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'test' });
process.env.CLEANUP_SECRET           = 'cleanup-secret-789';

// ── Firebase Admin モック ────────────────────────────────────────────
const mockOrgsGet     = jest.fn();
const mockGetUser     = jest.fn();
const mockDeleteUser  = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();

jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => ({
    collection: jest.fn(() => ({ where: jest.fn(() => ({ get: mockOrgsGet })) })),
    batch: jest.fn(() => ({ delete: mockBatchDelete, commit: mockBatchCommit })),
  }));
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    firestore,
    auth: jest.fn(() => ({ getUser: mockGetUser, deleteUser: mockDeleteUser })),
  };
});

const { handler } = require('../../netlify/functions/cleanup-unverified/index.js');

const DAY = 24 * 60 * 60 * 1000;
function orgDoc(id, { ageDays, emailVerified = false, owner_uid = `uid-${id}`, menus = [] } = {}) {
  const ref = {
    id: `ref-${id}`,
    collection: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: menus.map(m => ({ ref: `menu-${m}` })) }) })),
  };
  return {
    id,
    ref,
    data: () => ({
      name: `Club ${id}`,
      status: 'pending',
      emailVerified,
      owner_uid,
      created_at: ageDays == null ? null : { toMillis: () => Date.now() - ageDays * DAY },
    }),
  };
}

const scheduled = (extra = {}) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ next_run: 'x', ...extra }) });

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockOrgsGet.mockReset().mockResolvedValue({ docs: [] });
  mockGetUser.mockReset().mockResolvedValue({ emailVerified: false });
  mockDeleteUser.mockReset().mockResolvedValue();
  mockBatchDelete.mockReset();
  mockBatchCommit.mockReset().mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

// ════════════════════════════════════════════════════════════════════
// 1. 実行ガード
// ════════════════════════════════════════════════════════════════════
describe('実行ガード', () => {
  test('secret もスケジュールペイロードもない → 403', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: '' });
    expect(res.statusCode).toBe(403);
    expect(mockOrgsGet).not.toHaveBeenCalled();
  });

  test('x-cleanup-secret が不一致 → 403', async () => {
    const res = await handler({ httpMethod: 'POST', headers: { 'x-cleanup-secret': 'wrong' }, body: '' });
    expect(res.statusCode).toBe(403);
  });

  test('CLEANUP_SECRET 未設定時はヘッダーがあっても 403', async () => {
    const orig = process.env.CLEANUP_SECRET;
    delete process.env.CLEANUP_SECRET;
    try {
      const res = await handler({ httpMethod: 'POST', headers: { 'x-cleanup-secret': '' }, body: '' });
      expect(res.statusCode).toBe(403);
    } finally {
      process.env.CLEANUP_SECRET = orig;
    }
  });

  test('スケジュール実行 → 200', async () => {
    const res = await handler(scheduled());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(0);
  });

  test('正しい secret → 200', async () => {
    const res = await handler({ httpMethod: 'POST', headers: { 'x-cleanup-secret': 'cleanup-secret-789' }, body: '' });
    expect(res.statusCode).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. 削除対象の判定
// ════════════════════════════════════════════════════════════════════
describe('削除対象の判定', () => {
  test('登録から10分〜6日の未確認申請は削除しない（旧10分削除の再発防止）', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('a', { ageDays: 0.01 }), orgDoc('b', { ageDays: 6 })] });
    const res = await handler(scheduled());
    expect(JSON.parse(res.body).deleted).toBe(0);
    expect(mockBatchCommit).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test('7日を過ぎた未確認申請は org・メニュー・Auth を削除', async () => {
    const doc = orgDoc('old', { ageDays: 8, menus: ['m1', 'm2'] });
    mockOrgsGet.mockResolvedValue({ docs: [doc] });
    const res = await handler(scheduled());
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(1);
    expect(body.ids).toEqual(['old']);
    expect(mockBatchDelete).toHaveBeenCalledWith('menu-m1');
    expect(mockBatchDelete).toHaveBeenCalledWith('menu-m2');
    expect(mockBatchDelete).toHaveBeenCalledWith(doc.ref);
    expect(mockDeleteUser).toHaveBeenCalledWith('uid-old');
  });

  test('Firestore の emailVerified=true は削除しない', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('v', { ageDays: 30, emailVerified: true })] });
    const res = await handler(scheduled());
    expect(JSON.parse(res.body).deleted).toBe(0);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test('Firestore は未確認でも Auth 側が確認済みならスキップ', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('s', { ageDays: 30 })] });
    mockGetUser.mockResolvedValue({ emailVerified: true });
    const res = await handler(scheduled());
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  test('Auth ユーザーが既に無い場合は org のみ削除', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('g', { ageDays: 30 })] });
    mockGetUser.mockRejectedValue(Object.assign(new Error('nf'), { code: 'auth/user-not-found' }));
    const res = await handler(scheduled());
    expect(JSON.parse(res.body).deleted).toBe(1);
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test('owner_uid / created_at が無いデータは触らない', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('n1', { ageDays: 30, owner_uid: null }), orgDoc('n2', { ageDays: null })] });
    const res = await handler(scheduled());
    expect(JSON.parse(res.body).deleted).toBe(0);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test('getUser がその他のエラー → 削除せずスキップ', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('e', { ageDays: 30 })] });
    mockGetUser.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/internal-error' }));
    const res = await handler(scheduled());
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  test('1件の削除失敗で他の削除は止まらない', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('f1', { ageDays: 30 }), orgDoc('f2', { ageDays: 30 })] });
    mockBatchCommit.mockRejectedValueOnce(new Error('commit failed')).mockResolvedValue();
    const res = await handler(scheduled());
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.ids).toEqual(['f2']);
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. dryRun
// ════════════════════════════════════════════════════════════════════
describe('dryRun', () => {
  test('secret + dryRun=true → 対象を返すが削除しない', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('d', { ageDays: 30 })] });
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-cleanup-secret': 'cleanup-secret-789' },
      body: JSON.stringify({ dryRun: true }),
    });
    const body = JSON.parse(res.body);
    expect(body.dryRun).toBe(true);
    expect(body.ids).toEqual(['d']);
    expect(mockBatchCommit).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test('スケジュール実行では dryRun 指定を無視して削除する', async () => {
    mockOrgsGet.mockResolvedValue({ docs: [orgDoc('d2', { ageDays: 30 })] });
    const res = await handler(scheduled({ dryRun: true }));
    expect(JSON.parse(res.body).dryRun).toBe(false);
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. エラー
// ════════════════════════════════════════════════════════════════════
test('Firestore 取得失敗 → 500（内部メッセージは返さない）', async () => {
  mockOrgsGet.mockRejectedValue(new Error('secret internal detail'));
  const res = await handler(scheduled());
  expect(res.statusCode).toBe(500);
  expect(res.body).not.toContain('secret internal detail');
});
