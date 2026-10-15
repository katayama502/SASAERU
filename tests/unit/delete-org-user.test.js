/**
 * delete-org-user Netlify Function テスト
 * - 管理者認証
 * - 団体削除: Auth → Firestore の順、Auth 失敗時は Firestore に触れない
 * - 登録メールで作られた別アカウントも削除（管理者・他団体の持ち主は除外）
 * - 孤立アカウント（団体なし）のメール指定削除
 */

'use strict';

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', project_id: 'test' });

// ── 状態（テストごとに設定） ─────────────────────────────────────────
let mockOrgs;      // { [orgId]: data }
let mockAdmins;    // Set<uid>
let mockUsers;     // { [uid]: { uid, email, customClaims } }
let mockRelated;   // { inquiries: [...], posts: [...] }  各要素 { path, org_id, owner_uid }

const mockVerifyIdToken  = jest.fn();
const mockDeleteUser     = jest.fn();
const mockRecursiveDelete = jest.fn();
const mockBatchDelete    = jest.fn();
const mockBatchCommit    = jest.fn();

function mockSnapOf(docs) {
  return { docs, empty: docs.length === 0 };
}

jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => ({
    collection: jest.fn((name) => ({
      doc: jest.fn((id) => ({
        id,
        path: `${name}/${id}`,
        get: jest.fn(async () => {
          if (name === 'organizations') return { exists: !!mockOrgs[id], data: () => mockOrgs[id] };
          if (name === 'admins') return { exists: mockAdmins.has(id) };
          return { exists: false };
        }),
      })),
      where: jest.fn((field, _op, value) => ({
        get: jest.fn(async () => {
          if (name === 'organizations') {
            return mockSnapOf(Object.entries(mockOrgs).filter(([, o]) => o[field] === value).map(([id]) => ({ id })));
          }
          const list = (mockRelated[name] || []).filter(d => d[field] === value);
          return mockSnapOf(list.map(d => ({ ref: { path: d.path } })));
        }),
      })),
    })),
    recursiveDelete: mockRecursiveDelete,
    batch: jest.fn(() => ({ delete: mockBatchDelete, commit: mockBatchCommit })),
  }));
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    firestore,
    auth: jest.fn(() => ({
      verifyIdToken: mockVerifyIdToken,
      deleteUser: mockDeleteUser,
      getUser: jest.fn(async (uid) => {
        if (!mockUsers[uid]) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
        return mockUsers[uid];
      }),
      getUserByEmail: jest.fn(async (email) => {
        const u = Object.values(mockUsers).find(x => x.email === email);
        if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
        return u;
      }),
    })),
  };
});

const { handler } = require('../../netlify/functions/delete-org-user/index.js');

let ipSeq = 0;
function req(body, { token = 'admin-token' } = {}) {
  ipSeq += 1; // レート制限に掛からないよう IP を変える
  return {
    httpMethod: 'POST',
    headers: {
      origin: 'https://sasaeru.netlify.app',
      'x-nf-client-connection-ip': `10.0.0.${ipSeq}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockOrgs = {
    org1: { name: 'KSS', owner_uid: 'owner1', contact_email: 'kss@example.jp' },
  };
  mockAdmins = new Set(['adminUid']);
  mockUsers = {
    owner1:   { uid: 'owner1', email: 'kss@example.jp' },
    adminUid: { uid: 'adminUid', email: 'admin@example.jp', customClaims: { admin: true } },
  };
  mockRelated = {
    inquiries: [{ path: 'inquiries/i1', org_id: 'org1' }],
    posts: [
      { path: 'posts/p1', org_id: 'org1', owner_uid: 'owner1' },
      { path: 'posts/p2', org_id: 'other', owner_uid: 'owner1' },
    ],
  };
  mockVerifyIdToken.mockReset().mockResolvedValue({ uid: 'adminUid', admin: true });
  mockDeleteUser.mockReset().mockImplementation(async (uid) => {
    if (!mockUsers[uid]) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    delete mockUsers[uid];
  });
  mockRecursiveDelete.mockReset().mockImplementation(async (ref) => { delete mockOrgs[ref.id]; });
  mockBatchDelete.mockReset();
  mockBatchCommit.mockReset().mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

// ════════════════════════════════════════════════════════════════════
describe('認証', () => {
  test('トークンなし → 401', async () => {
    const res = await handler(req({ orgId: 'org1' }, { token: null }));
    expect(res.statusCode).toBe(401);
  });

  test('管理者以外 → 403、何も削除しない', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u', admin: false });
    const res = await handler(req({ orgId: 'org1' }));
    expect(res.statusCode).toBe(403);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
  });

  test('orgId も uid も無い → 400', async () => {
    const res = await handler(req({}));
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('団体削除', () => {
  test('Auth・団体（サブコレクション含む）・支援申請・活動日記をすべて削除', async () => {
    const res = await handler(req({ orgId: 'org1' }));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.authDeleted).toEqual(['owner1']);
    expect(mockUsers.owner1).toBeUndefined();
    expect(mockOrgs.org1).toBeUndefined();
    const deletedPaths = mockBatchDelete.mock.calls.map(c => c[0].path);
    expect(deletedPaths).toEqual(expect.arrayContaining(['inquiries/i1', 'posts/p1', 'posts/p2']));
    expect(deletedPaths.filter(p => p === 'posts/p1')).toHaveLength(1); // 重複削除しない
  });

  test('Auth を Firestore より先に削除する', async () => {
    const order = [];
    mockDeleteUser.mockImplementation(async () => { order.push('auth'); });
    mockRecursiveDelete.mockImplementation(async () => { order.push('firestore'); });
    await handler(req({ orgId: 'org1' }));
    expect(order).toEqual(['auth', 'firestore']);
  });

  test('Auth 削除に失敗 → 500、団体データは残る（再試行できる）', async () => {
    mockDeleteUser.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/internal-error' }));
    const res = await handler(req({ orgId: 'org1' }));
    expect(res.statusCode).toBe(500);
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockOrgs.org1).toBeDefined();
  });

  test('Auth が既に無い場合も団体データを削除して成功', async () => {
    delete mockUsers.owner1;
    const res = await handler(req({ orgId: 'org1' }));
    expect(res.statusCode).toBe(200);
    expect(mockOrgs.org1).toBeUndefined();
  });

  test('owner_uid とずれた、登録メールのアカウントも削除', async () => {
    mockUsers.stray = { uid: 'stray', email: 'kss@example.jp' };
    delete mockUsers.owner1;
    const res = await handler(req({ orgId: 'org1' }));
    expect(JSON.parse(res.body).authDeleted).toEqual(['stray']);
    expect(mockUsers.stray).toBeUndefined();
  });

  test('登録メールのアカウントが別団体の持ち主なら削除しない', async () => {
    delete mockUsers.owner1;
    mockUsers.other = { uid: 'other', email: 'kss@example.jp' };
    mockOrgs.org2 = { name: 'Other', owner_uid: 'other' };
    const res = await handler(req({ orgId: 'org1' }));
    expect(res.statusCode).toBe(200);
    expect(mockUsers.other).toBeDefined();
  });

  test('持ち主が管理者アカウントなら Auth は残し、団体データだけ削除', async () => {
    mockOrgs.org1.owner_uid = 'adm2';
    mockOrgs.org1.contact_email = 'adm2@example.jp';
    mockUsers.adm2 = { uid: 'adm2', email: 'adm2@example.jp', customClaims: { admin: true } };
    const res = await handler(req({ orgId: 'org1' }));
    const body = JSON.parse(res.body);
    expect(body.authDeleted).toEqual([]);
    expect(body.authKept).toEqual(['admin-account']);
    expect(mockUsers.adm2).toBeDefined();
    expect(mockOrgs.org1).toBeUndefined();
  });

  test('団体が見つからない → 404', async () => {
    const res = await handler(req({ orgId: 'nope' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('org-not-found');
  });
});

// ════════════════════════════════════════════════════════════════════
describe('孤立アカウント削除（action: orphan）', () => {
  test('団体を持たないアカウント → 削除', async () => {
    mockUsers.orphan = { uid: 'orphan', email: 'orphan@example.jp' };
    const res = await handler(req({ action: 'orphan', email: 'orphan@example.jp' }));
    expect(res.statusCode).toBe(200);
    expect(mockUsers.orphan).toBeUndefined();
  });

  test('団体を持っているアカウント → 409、削除しない', async () => {
    const res = await handler(req({ action: 'orphan', email: 'kss@example.jp' }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('has-organization');
    expect(mockUsers.owner1).toBeDefined();
  });

  test('管理者アカウント → 400、削除しない', async () => {
    const res = await handler(req({ action: 'orphan', email: 'admin@example.jp' }));
    expect(res.statusCode).toBe(400);
    expect(mockUsers.adminUid).toBeDefined();
  });

  test('admins コレクションにだけ登録された招待中の管理者も削除しない', async () => {
    mockUsers.inv = { uid: 'inv', email: 'inv@example.jp' };
    mockAdmins.add('inv');
    const res = await handler(req({ action: 'orphan', email: 'inv@example.jp' }));
    expect(res.statusCode).toBe(400);
    expect(mockUsers.inv).toBeDefined();
  });

  test('アカウントが無い → 404 user-not-found', async () => {
    const res = await handler(req({ action: 'orphan', email: 'none@example.jp' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('user-not-found');
  });

  test('メール形式が不正 → 400', async () => {
    const res = await handler(req({ action: 'orphan', email: 'bad\r\nBcc: x@y.z' }));
    expect(res.statusCode).toBe(400);
  });
});
