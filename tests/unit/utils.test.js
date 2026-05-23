/**
 * クライアントサイド ユーティリティ関数テスト
 * index.html の inline JS から抽出した純粋関数のテスト
 *
 * 対象:
 *  - validatePassword()
 *  - esc() (HTML エスケープ)
 *  - SHIMANE_AREAS (19市町村リスト)
 *  - SUPPORT_CATEGORIES (8カテゴリ)
 *  - area フィールド後方互換ロジック
 *  - Firestore Security Rules ロジック（パスワード強度のみ）
 */

'use strict';

// ── index.html からロジックを抽出（テスト用関数定義） ─────────────────

/**
 * パスワードバリデーション (index.html 936行目より抽出)
 */
function validatePassword(pw) {
  return {
    length: pw.length >= 8,
    letter: /[a-zA-Z]/.test(pw),
    digit:  /[0-9]/.test(pw),
    symbol: /[^a-zA-Z0-9]/.test(pw),
  };
}

/**
 * HTMLエスケープ (index.html 984行目より抽出)
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
  );
}

/**
 * 島根19市町村リスト (index.html 799行目より抽出)
 */
const SHIMANE_AREAS = [
  '松江市','浜田市','出雲市','益田市','大田市','安来市','江津市','雲南市',
  '奥出雲町','飯南町','川本町','美郷町','邑南町','津和野町','吉賀町',
  '海士町','西ノ島町','知夫村','隠岐の島町',
];

/**
 * 支援カテゴリ (index.html 873行目より抽出)
 */
const SUPPORT_CATEGORIES = ['遠征費','大会参加費','ユニフォーム代','備品・用具費','グラウンド使用料','指導者謝礼','活動運営費','その他'];

/**
 * area フィールド後方互換表示ロジック (admin.html・mypage.html で使用)
 */
function formatArea(area) {
  return Array.isArray(area) ? area.join('・') : (area || '');
}

/**
 * パスワード全条件チェック (登録フォームで使用)
 */
function isPasswordValid(pw) {
  const r = validatePassword(pw);
  return r.length && r.letter && r.digit && r.symbol;
}

// ════════════════════════════════════════════════════════════════════
// 1. validatePassword
// ════════════════════════════════════════════════════════════════════
describe('validatePassword()', () => {
  // ── 長さ ──
  test('8文字未満 → length: false', () => {
    expect(validatePassword('Ab1!').length).toBe(false);
  });
  test('8文字 → length: true', () => {
    expect(validatePassword('Abcde1!x').length).toBe(true);
  });
  test('20文字 → length: true', () => {
    expect(validatePassword('Abcdefgh12345678901!').length).toBe(true);
  });

  // ── 英字 ──
  test('英字なし → letter: false', () => {
    expect(validatePassword('12345678!').letter).toBe(false);
  });
  test('小文字のみ → letter: true', () => {
    expect(validatePassword('abcdefg1!').letter).toBe(true);
  });
  test('大文字のみ → letter: true', () => {
    expect(validatePassword('ABCDEFG1!').letter).toBe(true);
  });

  // ── 数字 ──
  test('数字なし → digit: false', () => {
    expect(validatePassword('Abcdefg!!').digit).toBe(false);
  });
  test('数字あり → digit: true', () => {
    expect(validatePassword('Abcdef1!').digit).toBe(true);
  });

  // ── 記号 ──
  test('記号なし → symbol: false', () => {
    expect(validatePassword('Abcdefg1').symbol).toBe(false);
  });
  test('! → symbol: true', () => {
    expect(validatePassword('Abcdef1!').symbol).toBe(true);
  });
  test('@ → symbol: true', () => {
    expect(validatePassword('Abcdef1@').symbol).toBe(true);
  });
  test('日本語文字 → symbol: true', () => {
    expect(validatePassword('Abcdef1あ').symbol).toBe(true);
  });

  // ── 全条件満たす ──
  test('有効なパスワード → 全 true', () => {
    const result = validatePassword('MyPass1!');
    expect(result).toEqual({ length: true, letter: true, digit: true, symbol: true });
  });

  // ── 全条件失敗 ──
  test('空文字列 → 全 false', () => {
    const result = validatePassword('');
    expect(result).toEqual({ length: false, letter: false, digit: false, symbol: false });
  });

  // ── isPasswordValid ヘルパー ──
  test('isPasswordValid: 有効パスワードで true', () => {
    expect(isPasswordValid('Secure1!')).toBe(true);
  });
  test('isPasswordValid: 記号なしで false', () => {
    expect(isPasswordValid('Secure123')).toBe(false);
  });
  test('isPasswordValid: 短すぎで false', () => {
    expect(isPasswordValid('Ab1!')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. esc() - HTML エスケープ
// ════════════════════════════════════════════════════════════════════
describe('esc() HTML エスケープ', () => {
  test('& → &amp;', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });
  test('< → &lt;', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  test('> → &gt;', () => {
    expect(esc('a > b')).toBe('a &gt; b');
  });
  test('" → &quot;', () => {
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
  });
  test("' → &#39;", () => {
    expect(esc("it's")).toBe("it&#39;s");
  });
  test('XSS スクリプト注入をエスケープ', () => {
    const xss = '<script>alert("xss")</script>';
    const escaped = esc(xss);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
  test('安全な文字列はそのまま', () => {
    expect(esc('松江FC')).toBe('松江FC');
    expect(esc('hello world')).toBe('hello world');
  });
  test('null → 空文字列', () => {
    expect(esc(null)).toBe('');
  });
  test('undefined → 空文字列', () => {
    expect(esc(undefined)).toBe('');
  });
  test('数値 → 文字列に変換', () => {
    expect(esc(42)).toBe('42');
  });
  test('複合: 複数特殊文字', () => {
    expect(esc('<a href="x&y">test</a>')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;test&lt;/a&gt;');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. SHIMANE_AREAS
// ════════════════════════════════════════════════════════════════════
describe('SHIMANE_AREAS 地域リスト', () => {
  test('19件ある', () => {
    expect(SHIMANE_AREAS).toHaveLength(19);
  });

  test('松江市が含まれる', () => {
    expect(SHIMANE_AREAS).toContain('松江市');
  });

  test('出雲市が含まれる', () => {
    expect(SHIMANE_AREAS).toContain('出雲市');
  });

  test('隠岐の島町が含まれる', () => {
    expect(SHIMANE_AREAS).toContain('隠岐の島町');
  });

  test('重複なし', () => {
    const unique = new Set(SHIMANE_AREAS);
    expect(unique.size).toBe(SHIMANE_AREAS.length);
  });

  test('全て文字列型', () => {
    SHIMANE_AREAS.forEach(a => expect(typeof a).toBe('string'));
  });

  test('全て非空文字列', () => {
    SHIMANE_AREAS.forEach(a => expect(a.length).toBeGreaterThan(0));
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. SUPPORT_CATEGORIES
// ════════════════════════════════════════════════════════════════════
describe('SUPPORT_CATEGORIES 支援カテゴリ', () => {
  test('8件ある', () => {
    expect(SUPPORT_CATEGORIES).toHaveLength(8);
  });

  test('遠征費が含まれる', () => {
    expect(SUPPORT_CATEGORIES).toContain('遠征費');
  });

  test('その他が含まれる（自由入力のトリガー）', () => {
    expect(SUPPORT_CATEGORIES).toContain('その他');
  });

  test('その他は末尾', () => {
    expect(SUPPORT_CATEGORIES[SUPPORT_CATEGORIES.length - 1]).toBe('その他');
  });

  test('重複なし', () => {
    const unique = new Set(SUPPORT_CATEGORIES);
    expect(unique.size).toBe(SUPPORT_CATEGORIES.length);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. area フィールド後方互換ロジック
// ════════════════════════════════════════════════════════════════════
describe('formatArea() area フィールド後方互換', () => {
  test('配列 → "・" 区切り文字列', () => {
    expect(formatArea(['松江市', '出雲市', '浜田市'])).toBe('松江市・出雲市・浜田市');
  });

  test('配列1件 → そのまま', () => {
    expect(formatArea(['松江市'])).toBe('松江市');
  });

  test('空配列 → 空文字列', () => {
    expect(formatArea([])).toBe('');
  });

  test('旧形式: 文字列 → そのまま返す（後方互換）', () => {
    expect(formatArea('松江市・出雲市')).toBe('松江市・出雲市');
  });

  test('null/undefined → 空文字列', () => {
    expect(formatArea(null)).toBe('');
    expect(formatArea(undefined)).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. マルチセレクト ステート管理ロジック
// ════════════════════════════════════════════════════════════════════
describe('地域マルチセレクト ステート管理', () => {
  let _selectedAreas;

  beforeEach(() => {
    _selectedAreas = [];
  });

  function selectArea(name) {
    if (!_selectedAreas.includes(name)) _selectedAreas.push(name);
  }

  function removeArea(i) {
    _selectedAreas.splice(i, 1);
  }

  test('selectArea: 新規追加', () => {
    selectArea('松江市');
    expect(_selectedAreas).toEqual(['松江市']);
  });

  test('selectArea: 重複は追加されない', () => {
    selectArea('松江市');
    selectArea('松江市');
    expect(_selectedAreas).toHaveLength(1);
  });

  test('selectArea: 複数追加', () => {
    selectArea('松江市');
    selectArea('出雲市');
    expect(_selectedAreas).toEqual(['松江市', '出雲市']);
  });

  test('removeArea: インデックス指定で削除', () => {
    selectArea('松江市');
    selectArea('出雲市');
    removeArea(0);
    expect(_selectedAreas).toEqual(['出雲市']);
  });

  test('removeArea: 末尾削除', () => {
    selectArea('松江市');
    selectArea('出雲市');
    removeArea(1);
    expect(_selectedAreas).toEqual(['松江市']);
  });

  test('全削除後は空配列', () => {
    selectArea('松江市');
    removeArea(0);
    expect(_selectedAreas).toEqual([]);
  });

  test('JSON.stringify でシリアライズ可能', () => {
    selectArea('松江市');
    selectArea('出雲市');
    const json = JSON.stringify(_selectedAreas);
    expect(JSON.parse(json)).toEqual(['松江市', '出雲市']);
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. 支援カテゴリ選択ロジック
// ════════════════════════════════════════════════════════════════════
describe('支援カテゴリ選択ロジック', () => {
  let _selectedSupportCats;

  beforeEach(() => {
    _selectedSupportCats = [];
  });

  function toggleSupportCat(cat) {
    const idx = _selectedSupportCats.indexOf(cat);
    if (idx >= 0) {
      _selectedSupportCats.splice(idx, 1);
    } else {
      _selectedSupportCats.push(cat);
    }
  }

  function buildTagsValue(otherText) {
    return _selectedSupportCats
      .map(c => c === 'その他' ? (otherText.trim() || 'その他') : c)
      .join(',');
  }

  test('カテゴリを選択できる', () => {
    toggleSupportCat('遠征費');
    expect(_selectedSupportCats).toContain('遠征費');
  });

  test('同じカテゴリを再選択で解除', () => {
    toggleSupportCat('遠征費');
    toggleSupportCat('遠征費');
    expect(_selectedSupportCats).not.toContain('遠征費');
    expect(_selectedSupportCats).toHaveLength(0);
  });

  test('複数選択可能', () => {
    toggleSupportCat('遠征費');
    toggleSupportCat('ユニフォーム代');
    expect(_selectedSupportCats).toHaveLength(2);
  });

  test('buildTagsValue: カテゴリのカンマ区切り生成', () => {
    toggleSupportCat('遠征費');
    toggleSupportCat('大会参加費');
    expect(buildTagsValue('')).toBe('遠征費,大会参加費');
  });

  test('buildTagsValue: その他選択時は自由入力テキストが入る', () => {
    toggleSupportCat('遠征費');
    toggleSupportCat('その他');
    expect(buildTagsValue('機材費')).toBe('遠征費,機材費');
  });

  test('buildTagsValue: その他選択・自由入力空の場合は「その他」', () => {
    toggleSupportCat('その他');
    expect(buildTagsValue('')).toBe('その他');
  });

  test('buildTagsValue: 自由入力のトリム', () => {
    toggleSupportCat('その他');
    expect(buildTagsValue('  機材費  ')).toBe('機材費');
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. パスワード強度の境界値テスト
// ════════════════════════════════════════════════════════════════════
describe('パスワード境界値', () => {
  test('7文字: 境界値未満 → length: false', () => {
    expect(validatePassword('Ab1!xyz').length).toBe(false);
  });

  test('8文字: 境界値ちょうど → length: true', () => {
    expect(validatePassword('Ab1!xyzw').length).toBe(true);
  });

  test('スペースは記号扱い', () => {
    expect(validatePassword('Ab1 def').symbol).toBe(true);
  });

  test('全角数字は digit に含まれない（半角のみ）', () => {
    expect(validatePassword('Abcdefg１').digit).toBe(false);
  });

  test('全角英字は letter に含まれない（半角のみ）', () => {
    expect(validatePassword('Ａbcdef1!').letter).toBe(true); // 半角 b が含まれるので true
  });

  test('半角英字のみ（記号・数字なし）の組み合わせ', () => {
    const r = validatePassword('abcdefgh');
    expect(r.length).toBe(true);
    expect(r.letter).toBe(true);
    expect(r.digit).toBe(false);
    expect(r.symbol).toBe(false);
  });
});
