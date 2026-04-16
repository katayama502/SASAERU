# SASAERU 総合テスト結果レポート

**実施日**: 2026-04-16  
**実施者**: G-Stack AI Testerエージェント  
**対象バージョン**: SASAERU v1.0（初回リリース候補）  
**テスト方法**: コードレビューベース静的テスト  

---

## テスト対象ファイル

| ファイル | 行数 | 概要 |
|---------|------|------|
| `index.html` | 1,067行 | 公開サイト（メインUI） |
| `admin.html` | 836行 | 管理ダッシュボード |
| `firestore.rules` | 36行 | Firestoreセキュリティルール |
| `netlify.toml` | 15行 | Netlifyデプロイ設定 |

---

## 1. 機能テスト（index.html）

| テストID | テスト項目 | 結果 | 詳細 |
|---------|-----------|------|------|
| F-01 | Firebase初期化 | ✅ PASS | `isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY"` で判定。実際のAPIキーが設定済み（`AIzaSyBJrC...`）。`try/catch`でエラーハンドリング実装済み。`db = null` 初期化でフォールバック動作保証。 |
| F-02 | 団体一覧読み込み | ✅ PASS | Firestore接続成功時は`status == 'public'`フィルター + `orderBy('created_at', 'desc')` + `limit(30)`で取得。接続失敗・空の場合は`SAMPLE_ORGS`（3件）にフォールバック。`catch`で警告ログ出力。 |
| F-03 | タブフィルター | ✅ PASS | `data-tab="all/sports/culture/welfare"` の4タブ実装。クリックイベントで`currentFilter`更新後`renderOrgs()`を呼び出し。アクティブタブのハイライト切り替えも実装済み。 |
| F-04 | 団体登録モーダル | ✅ PASS | `openRegisterModal()`/`closeRegisterModal()`で開閉。`required`属性によるHTML5バリデーション（name/category/area/contact_email/activity_how）。Firestore送信後3秒でモーダル自動クローズ。`body.style.overflow = 'hidden'`でスクロール制御。 |
| F-05 | 支援申請モーダル | ✅ PASS | `openInquiryModal(orgId, orgName)`でorg_idを引き継ぎ。`form.reset()`後に`inquiry-org-id`に値を再セット（reset後の再セット処理あり）。Firestore`inquiries`コレクションに送信。 |
| F-06 | お問い合わせフォーム | ✅ PASS | `contact-form`の`submit`イベントでFirestore`contacts`コレクションに保存。`required`属性（name/email/message）。Firebase未設定時のデモモードメッセージ表示。 |
| F-07 | 統計カウンター | ✅ PASS | `animateCount()`でスムーズなカウントアップ。`if (target === 0) { el.textContent = 0; return; }` で0値を明示的に処理。`step = Math.max(1, Math.ceil(target/30))`で適切なステップ計算。`inquiries`はReadルール制限のため`--`表示（コメントあり）。 |
| F-08 | ESCキー | ✅ PASS | `document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeRegisterModal(); closeInquiryModal(); } })` で両モーダルを閉じる処理実装済み。 |
| F-09 | モバイルメニュー | ✅ PASS | `toggleMobileMenu()`でhiddenクラスをトグル。メニュー開閉状態に応じてSVGアイコン（ハンバーガー/X）を切り替え。`closeMobileMenu()`でリンクからのページ遷移後に自動クローズ。 |
| F-10 | Toastメッセージ | ✅ PASS | `showToast(msg, ok)`で緑（成功）/赤（失敗）の2色Toast。`setTimeout(() => t.classList.add('hidden'), 3500)` で3.5秒後に自動非表示。 |
| F-11 | XSSエスケープ | ✅ PASS | `esc(s)`関数で`&`, `<`, `>`, `"`, `'`の5文字をHTMLエンティティに変換。`renderOrgs()`内の全ユーザー入力値（orgName/catLabel/tags/desc/img/area）に適用済み。 |
| F-12 | data-*属性経由のモーダル | ✅ PASS | `data-org-id="${orgId}" data-org-name="${orgName}"`（いずれもesc()適用済み）をHTMLに埋め込み。`onclick="openInquiryModal(this.dataset.orgId, this.dataset.orgName)"`でDOM経由取得。インライン`javascript:`は未使用。 |

**機能テスト（index.html）合計: 12/12 PASS**

---

## 2. 機能テスト（admin.html）

| テストID | テスト項目 | 結果 | 詳細 |
|---------|-----------|------|------|
| A-01 | ログイン | ✅ PASS | `auth.signInWithEmailAndPassword(email, password)`で認証。エラーコード4種を日本語メッセージにマッピング（`auth/user-not-found`, `auth/wrong-password`, `auth/invalid-email`, `auth/too-many-requests`）。フォールバックメッセージも用意。 |
| A-02 | デモモード | ✅ PASS | `!isConfigured`時は`showDashboard({ email: 'demo@sasaeru.jp' })`でダッシュボードを直接表示。各データ読み込み関数でも`!db`時に`demoMsg()`を返す。 |
| A-03 | ログアウト | ✅ PASS | `doSignOut()`で`auth.signOut()`を実行。Firebase未設定時は`showLogin()`を直接呼び出す。`onAuthStateChanged`ハンドラでサインアウト後に自動的にログイン画面へ遷移。 |
| A-04 | タブ切り替え | ✅ PASS | 5タブ（overview/pending/orgs/inquiries/contacts）実装。`switchTab(name)`で全タブのhidden切り替え。`side-btn`のハイライト更新（`bg-white/15`）。`page-title`/`page-subtitle`を`TAB_TITLES`マップから更新。切り替え後に`loadTab(name)`でデータ読み込み。 |
| A-05 | 概要タブ | ✅ PASS | 4統計カード（審査待ち/公開中/新規支援申請/お問い合わせ）。`Promise.all()`で4コレクション並列取得。最近の審査待ちリストを最大5件表示。Firebase未設定時は`renderOverviewDemo()`でダッシュ表示。 |
| A-06 | 審査待ちタブ | ✅ PASS | `loadPending()`で`status=='pending'`フィルター + `orderBy('created_at','desc')`取得。`approveOrg(id)`（確認なし即時）と`rejectOrg(id, name)`（確認ダイアログあり）を実装。バッジカウンター更新も実施。 |
| A-07 | 団体管理タブ | ✅ PASS | `loadOrgs()`で全件取得後`allOrgsData`にキャッシュ。`filterOrgs(f)`でall/public/pending/rejectedのクライアントサイドフィルター。ステータス変更（`changeOrgStatus()`）・削除（`deleteOrg()`）・承認（`approveOrg()`）のアクションボタン実装。削除はConfirmダイアログあり。 |
| A-08 | 支援申請タブ | ✅ PASS | `loadInquiries()`で全件取得。新規件数を`badge-inquiries`に表示。`updateInquiryStatus(id, 'done'/'new')`で対応済み/未対応切り替えボタン。`mailto:`リンクで返信機能。 |
| A-09 | お問い合わせタブ | ✅ PASS | `loadContacts()`で全件取得。名前・メール・日時・本文を表示。`mailto:`リンクで返信ボタン実装。 |
| A-10 | 確認ダイアログ | ✅ PASS | `showConfirm(title, body, btnLabel, btnColor, callback)`で汎用ダイアログ実装。削除（赤）・却下（赤）・非公開変更（グレー）の3アクションで使用。`confirmCallback`変数でコールバック管理。`closeConfirm()`でcallbackをnullに初期化。 |
| A-11 | バッジカウンター | ✅ PASS | `updateBadge(id, count)`でcount > 0時に表示・0時にhidden。`badge-pending`（審査待ち数）と`badge-inquiries`（新規申請数）を`loadOverview()`・`loadPending()`・`loadInquiries()`の各所で更新。 |
| A-12 | 更新ボタン | ✅ PASS | ヘッダーの更新ボタンが`refreshCurrent()`を呼び出し。`refreshCurrent()`は`loadTab(currentTab)`を実行し現在のタブのデータを再取得。 |

**機能テスト（admin.html）合計: 12/12 PASS**

---

## 3. セキュリティテスト

| テストID | テスト項目 | 結果 | 詳細 |
|---------|-----------|------|------|
| S-01 | Firestoreルール | ✅ PASS | **organizations**: 公開済み(`status=="public"`)は誰でも`get`可。一覧は管理者のみ。作成は`status=="pending"`のみ許可（status偽装防止）。更新・削除は管理者のみ。**inquiries/contacts**: 誰でも`create`可。読み取り・更新・削除は管理者のみ。3コレクションすべてに適切な権限設定。 |
| S-02 | 管理者認証 | ⚠️ WARN | `isAdmin()`は`request.auth != null`のみを確認。Firebaseプロジェクト内の**全認証ユーザー**が管理者として扱われる。専用ロール（例：Custom Claims `admin: true`）による絞り込みがない。一般ユーザーがFirebase Authでアカウント作成すると管理機能が利用可能になるリスクあり。 |
| S-03 | XSS対策 | ✅ PASS | `esc(s)`関数が`&<>"'`の5文字をエスケープ。index.html・admin.htmlの両方で実装・適用済み。`innerHTML`への動的代入箇所（renderOrgs/renderOrgCard/loadInquiries/loadContacts等）でesc()を漏れなく使用。`textContent`使用箇所はesc()不要で正しく実装。 |
| S-04 | セキュリティヘッダー | ✅ PASS | netlify.tomlで3ヘッダー設定済み：`X-Frame-Options: DENY`（クリックジャッキング防止）、`X-Content-Type-Options: nosniff`（MIMEスニッフィング防止）、`Referrer-Policy: strict-origin-when-cross-origin`（リファラー制御）。 |
| S-05 | フォームバリデーション | ✅ PASS | クラブ登録フォーム: name/category/area/contact_email/activity_how に`required`。contact_emailは`type="email"`。main_imageは`type="url"`。支援申請フォーム: company_name/pic_name/sender_email/message に`required`。sender_emailは`type="email"`。お問い合わせフォーム: name/email/message に`required`。emailは`type="email"`。 |

**セキュリティテスト合計: 4/5 PASS, 1 WARN**

### S-02 改善提案
```javascript
// firestore.rules - 現状
function isAdmin() {
  return request.auth != null;
}

// 推奨: Custom Claims によるロール制限
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}
```
Firebase Authのカスタムクレームで`admin: true`を設定するか、`admins`コレクションでメールアドレスホワイトリストを管理することを推奨。

---

## 4. UI/UXテスト

| テストID | テスト項目 | 結果 | 詳細 |
|---------|-----------|------|------|
| U-01 | レスポンシブ | ✅ PASS | モバイルメニュー（`md:hidden`）と デスクトップリンク（`hidden md:flex`）を分離実装。クラブ一覧グリッドは`grid md:grid-cols-3`。ヒーローテキストは`text-4xl md:text-6xl`でレスポンシブフォントサイズ。フォームグリッドも`grid md:grid-cols-2`で対応。 |
| U-02 | カードホバー | ✅ PASS | `.card-hover`クラスで`transition: transform 0.25s ease, box-shadow 0.25s ease`。ホバー時`translateY(-4px)`と`box-shadow: 0 20px 40px`のエフェクト。クラブ画像にも`hover:scale-105`のズームエフェクト追加。 |
| U-03 | モーダルアニメーション | ✅ PASS | `.modal-inner`クラスに`animation: slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)`を適用。`from`で`opacity:0, translateY(24px), scale(0.97)` → `to`で`opacity:1, translateY(0), scale(1)`のスプリングアニメーション。 |
| U-04 | アクセシビリティ | ⚠️ WARN | 良好な点: モーダルに`role="dialog" aria-modal="true" aria-labelledby`設定。モバイルメニューボタンに`aria-expanded aria-controls aria-label`設定。課題: クラブ登録フォームの`<label>`に`for`属性がなく`input`のid属性も未設定（関連付け欠如）。支援申請フォームも同様。 |
| U-05 | スクロールバー | ✅ PASS | `::-webkit-scrollbar { width: 6px }`, `::-webkit-scrollbar-track { background: #f1f5f9 }`, `::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 4px }` でカスタムスタイル実装済み。admin.htmlでも同様に実装（width: 5px）。 |
| U-06 | line-clamp | ✅ PASS | Tailwindの`line-clamp-3`に加え、CSSで`display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden`のフォールバック実装。旧ブラウザ対応済み。 |

**UI/UXテスト合計: 4/6 PASS, 2 WARN**

### U-04 改善提案
```html
<!-- 現状（label と input の関連付けなし） -->
<label class="block text-xs font-bold text-slate-600 mb-1.5">クラブ名 <span>*</span></label>
<input type="text" name="name" required ...>

<!-- 推奨（for/id で明示的に関連付け） -->
<label for="reg-name" class="block text-xs font-bold text-slate-600 mb-1.5">クラブ名 <span>*</span></label>
<input id="reg-name" type="text" name="name" required ...>
```
スクリーンリーダー利用者のアクセシビリティ向上のため、全フォーム項目に`for`/`id`の関連付けを追加することを推奨。

---

## 5. インフラテスト

| テストID | テスト項目 | 結果 | 詳細 |
|---------|-----------|------|------|
| I-01 | netlify.toml | ✅ PASS | `publish = "."` でルートディレクトリを公開。`/*` → `/index.html` (status: 200) のSPAリダイレクト設定で直接URLアクセスに対応。全パスにセキュリティヘッダー3種を適用。 |
| I-02 | Firestoreルール構文 | ✅ PASS | `rules_version = '2'`（推奨バージョン）。`service cloud.firestore`と`match /databases/{database}/documents`のルート構造が正しい。3コレクション（organizations/inquiries/contacts）のmatchブロックが適切に定義。`isAdmin()`ヘルパー関数を定義して再利用。 |
| I-03 | CDN読み込み | ✅ PASS | Firebase SDK: `https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js` (Google公式CDN)。Tailwind: `https://cdn.tailwindcss.com` (公式CDN)。Lucide: `https://unpkg.com/lucide@latest` (unpkg)。admin.htmlではFirebase Auth SDNも追加読み込み。バージョンはFirebase v10.12.2に固定済み（Lucideのみ`@latest`）。 |

**インフラテスト合計: 3/3 PASS**

---

## 発見事項サマリー

### 警告（WARN）一覧

| ID | 項目 | 優先度 | 内容 |
|----|------|--------|------|
| S-02 | 管理者認証 | 高 | `isAdmin()`がFirebaseプロジェクト内の全認証ユーザーを管理者扱い。Custom Claimsによる管理者ロール制限を推奨。 |
| U-04 | アクセシビリティ | 中 | フォームの`<label>`に`for`属性、`<input>`に`id`属性が未設定。スクリーンリーダー対応に影響。 |

### 軽微な気づき（INFO）

| 番号 | 項目 | 内容 |
|------|------|------|
| 1 | APIキーのハードコード | `firebaseConfig`のAPIキーがHTMLにハードコード。Firebase公開サイトでは一般的な実装だが、Firestoreルールによる適切なアクセス制限で対処済み。 |
| 2 | Lucide CDNバージョン | `lucide@latest`を使用。将来的な破壊的変更リスクあり。バージョン固定（例：`lucide@0.x.x`）を推奨。 |
| 3 | admin.htmlのSPAリダイレクト | netlify.tomlの`/*` → `index.html`リダイレクトにより、`/admin.html`への直接アクセスも`index.html`にリダイレクトされる可能性あり。admin.htmlへのアクセスが意図通り動作するか要確認。 |
| 4 | Toastタイムアウトの不一致 | index.htmlは3,500ms、admin.htmlは3,000msと微妙に異なる（動作上の問題はなし）。 |
| 5 | お問い合わせフォームのFirebase失敗時 | `contact-form`のFirebase送信失敗（catchブロック内）でToast/エラーメッセージが表示されない（`result.textContent`が更新されないまま）。 |

---

## テスト結果集計

| カテゴリ | PASS | WARN | FAIL | 合計 |
|---------|------|------|------|------|
| 機能テスト (index.html) | 12 | 0 | 0 | 12 |
| 機能テスト (admin.html) | 12 | 0 | 0 | 12 |
| セキュリティテスト | 4 | 1 | 0 | 5 |
| UI/UXテスト | 4 | 2 | 0 | 6 |
| インフラテスト | 3 | 0 | 0 | 3 |
| **合計** | **35** | **3** | **0** | **38** |

---

## 総合評価

```
★★★★☆  合格（リリース可能・警告事項の対応を推奨）
```

### 判定理由

**強み:**
- 全38項目でFAIL（致命的なバグ）なし
- XSS対策（esc()関数）が一貫して適用されており、インジェクション対策は堅牢
- Firestoreセキュリティルールは一般ユーザーによるデータ改ざんを適切に防止
- Firebase未設定時のデモモードフォールバックが実装されており、開発環境での動作確認が容易
- モーダルのアクセシビリティ（role/aria属性）が適切に実装されている
- セキュリティヘッダー3種がnetlify.tomlで設定済み

**対応推奨事項（リリース前）:**
1. **[高優先度]** S-02: Firestoreルールの`isAdmin()`にCustom Claims等によるロール制限を追加
2. **[中優先度]** U-04: 全フォーム項目に`for`/`id`の関連付けを追加してアクセシビリティを改善
3. **[低優先度]** お問い合わせフォームのFirebase失敗時エラーメッセージを追加
4. **[低優先度]** Lucide CDNのバージョンをLatestから固定バージョンに変更

**総合評価: 合格（条件付き）**  
S-02の管理者認証強化を実施した上での本番リリースを推奨します。

---

*レポート作成: G-Stack AI Testerエージェント / 2026-04-16*
