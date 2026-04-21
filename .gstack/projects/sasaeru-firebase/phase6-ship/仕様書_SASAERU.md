# SASAERU システム仕様書

**バージョン:** 2.0  
**作成日:** 2026-04-16  
**更新日:** 2026-04-21  
**作成者:** G-Stack AI チーム / Spec Writer  
**ステータス:** 確定版

---

## バージョン変更履歴

| バージョン | 更新日 | 主な変更内容 |
|----------|--------|------------|
| v1.0 | 2026-04-16 | 初版（index.html + admin.html のみ） |
| v1.1 | 2026-04-16 | club.html / mypage.html / menus / posts を追加 |
| v1.2 | 2026-04-16 | Custom Claims 管理者認証・セキュリティ強化 |
| v1.3 | 2026-04-16 | Promise ベース認証・サンプルデータ削除 |
| v1.4 | 2026-04-16 | Firebase CLI デプロイ環境整備・admin.html 認証ヘルパー一本化 |
| v1.5 | 2026-04-21 | terms.html / privacy.html 追加・Firestore rules 修正・onSnapshot 切り替え・Lucide バージョン固定・Cloudinary 画像アップロード・Slack 通知 |
| **v2.0** | **2026-04-21** | **config.js 削除（Netlify Snippet Injection に一本化）・ログアウト BFCache 対策・活動日記詳細モーダル追加** |

---

## v1.4 → v1.5 変更サマリー

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | `terms.html`（利用規約）/ `privacy.html`（プライバシーポリシー）を新規追加 | 2章・4章 |
| 2 | Firestore rules: `organizations` の `allow list` を `if isAuth()` → `if true` に変更（未認証でのクラブ一覧取得を許可） | 3章 |
| 3 | Firestore rules: `organizations/menus` の `allow list` を `if isOwnerOf(orgId)` → `if true` に変更（公開クラブ詳細ページでのメニュー一覧取得を許可） | 3章 |
| 4 | index.html: `loadOrgs()` / `loadStats()` を `.get()` から `.onSnapshot()` に変更（BFCache・キャッシュタイミング問題の解消） | 4章 |
| 5 | 全ページ: Lucide Icons を `@latest` → `@0.344.0` にバージョン固定 | 2章 |
| 6 | mypage.html: メニュー・日記の onclick を ID キャッシュ Map パターンに変更（XSS 対策強化） | 4章 |
| 7 | mypage.html / admin.html: `<meta name="robots" content="noindex,nofollow">` を追加 | 4章 |
| 8 | admin.html: `approveOrg` / `rejectOrg` / `changeOrgStatus` に `updated_at: serverTimestamp()` を追加 | 4章 |
| 9 | Cloudinary（unsigned upload）による画像アップロード機能を mypage.html に実装 | 4章 |
| 10 | Slack Webhook + EmailJS による管理者通知機能を実装（登録申請・支援申請・お問い合わせ） | 5章 |
| 11 | index.html: OGP タグ（`og:image` / `og:url` / `twitter:image` / `canonical`）を追加 | 4章 |
| 12 | 全ページフッター: 利用規約・プライバシーポリシー・運営団体リンクを実リンクに更新 | 4章 |

## v1.5 → v2.0 変更サマリー

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | 全ページ: `<script src="config.js">` タグを削除（Netlify Snippet Injection が `window.SASAERU_CONFIG` を注入するためファイルロード不要。ファイルが存在しない場合に MIME type エラーが発生していた問題を解消） | 2章・7章 |
| 2 | mypage.html: ログアウト時を `window.location.href` → `window.location.replace()` に変更（ブラウザ履歴からマイページエントリを置換） | 4章・5章 |
| 3 | mypage.html: `pageshow` イベントリスナーを追加（BFCache から復元時も認証チェックを実施） | 4章・5章 |
| 4 | club.html: 活動日記カードをクリックすると詳細モーダルが開くように変更（全文・画像・支援ボタン表示） | 4章 |
| 5 | club.html: `_postCache` Map を追加し、詳細モーダルの ID ルックアップに使用 | 4章 |

---

## 1. システム概要

### 1.1 サービス名・目的

| 項目 | 内容 |
|------|------|
| サービス名 | SASAERU（サポート） |
| サービス副題 | 地域循環型マッチングプラットフォーム |
| キャッチコピー | 地域クラブ活動支援プラットフォーム |
| 目的 | 資金難・コーチ不足に悩む地域クラブと、社会貢献を志す企業をつなぐマッチングプラットフォームを提供し、地域スポーツ・文化活動の持続的発展を支援する |
| 所在地 | 島根県松江市 |
| 連絡先 | info@sasaeru.jp |
| コピーライト | 2026 SASAERU Project All Rights Reserved |

### 1.2 対象ユーザー

| ユーザー区分 | 説明 | 主な操作 |
|------------|------|--------|
| 地域クラブ | スポーツ・文化芸術・福祉分野の地域活動団体 | 団体情報の登録申請・支援内容の掲載 |
| 企業・法人 | CSR・SCR活動を希望する企業 | クラブ検索・支援申請 |
| 管理者 | 一般社団法人しまね創生ラボの運営スタッフ | 団体審査・承認・問い合わせ管理 |

### 1.3 運営主体

**一般社団法人しまね創生ラボ**  
所在地：島根県松江市  
連絡先：info@sasaeru.jp  
Webサイト：https://www.scl.or.jp/

### 1.4 フェーズ定義

#### Phase 1（現行）
- 地域クラブの情報掲載（登録申請・審査・公開）
- 企業からの支援申請受付
- 管理者によるマッチング仲介
- お問い合わせフォーム
- 活動日記（クラブオーナーによる投稿）
- 管理者向け Slack / EmailJS 通知

#### Phase 2（拡張計画）
- 直接マッチング機能（クラブ・企業間メッセージ）
- 支援実績・レポート機能
- 地域別・カテゴリ別統計ダッシュボード
- SNS連携・拡散機能
- Firestoreインデックスの拡張（複合クエリ）

---

## 2. システム構成

### 2.1 アーキテクチャ図

```
┌────────────────────────────────────────────────────────────┐
│                      ユーザーブラウザ                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │index.html│ │club.html │ │mypage    │ │admin.html    │  │
│  │(公開サイト)│ │(詳細)    │ │.html     │ │(管理ダッシュ) │  │
│  └──────┬───┘ └──────┬───┘ └────┬─────┘ └──────┬───────┘  │
│  ┌──────┴──────────────┴─────────┴────────────── ┴──────┐  │
│  │     terms.html / privacy.html（法的ページ）            │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬────────────────────────────────────┘
                        │  Firebase v10 compat SDK (CDN)
┌───────────────────────▼────────────────────────────────────┐
│              Firebase (GCP: asia-northeast1)                │
│  ┌──────────────────────┐   ┌────────────────────────────┐  │
│  │  Firestore           │   │  Firebase Auth             │  │
│  │  - organizations     │   │  メール/パスワード認証       │  │
│  │  - organizations/    │   │  Custom Claims (admin)     │  │
│  │    menus（サブ）      │   └────────────────────────────┘  │
│  │  - posts             │                                    │
│  │  - inquiries         │                                    │
│  │  - contacts          │                                    │
│  └──────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   外部サービス                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Cloudinary  │  │  EmailJS     │  │  Slack           │  │
│  │  画像アップロ │  │  管理者通知  │  │  Webhook 通知    │  │
│  │  ード (CDN)  │  │  メール送信  │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 Netlify (ホスティング)                       │
│  - 静的ファイル配信                                          │
│  - CDNエッジ配信                                             │
│  - セキュリティヘッダー付与（netlify.toml）                  │
│  - Git push による自動デプロイ                               │
│  - Snippet Injection: window.SASAERU_CONFIG を注入          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 使用技術スタック

| カテゴリ | 技術 | バージョン / 詳細 |
|---------|------|----------------|
| フロントエンド | HTML5 / Vanilla JavaScript | - |
| CSSフレームワーク | Tailwind CSS | CDN版（tailwindcss.com） |
| アイコン | Lucide Icons | `unpkg.com/lucide@0.344.0`（バージョン固定） |
| フォント | Noto Sans JP | Google Fonts（400/500/700/900） |
| データベース | Firebase Firestore | v10.12.2 compat SDK |
| 認証 | Firebase Auth | v10.12.2 compat SDK（管理者・クラブオーナー共通）、Custom Claims でロール管理 |
| 画像アップロード | Cloudinary | Unsigned upload preset、ブラウザから直接 CDN へアップロード |
| 通知（メール） | EmailJS | Browser SDK v4、管理者宛てメール通知 |
| 通知（チャット） | Slack Incoming Webhook | fetch で POST、管理者チャンネルへ通知 |
| ホスティング | Netlify | 静的サイト配信、Snippet Injection |
| バックエンド | なし（フルサーバーレス） | - |

### 2.3 ファイル構成一覧

```
SASAERU/
├── index.html              # 公開サイト（メインページ）
├── club.html               # クラブ詳細ページ（公開）
├── mypage.html             # クラブオーナー マイページ
├── admin.html              # 管理ダッシュボード
├── terms.html              # 利用規約ページ（2026-04-21追加）
├── privacy.html            # プライバシーポリシーページ（2026-04-21追加）
├── firestore.rules         # Firestore セキュリティルール（Firebase にデプロイ済み）
├── firestore.indexes.json  # Firestore 複合インデックス定義（デプロイ済み）
├── firebase.json           # Firebase CLI 設定
├── .firebaserc             # Firebase プロジェクト紐付け（sasaeru-7f375）
├── .gitignore              # config.js / サービスアカウントキー等を除外
├── netlify.toml            # Netlify 設定（リダイレクト・ヘッダー）
└── .gstack/
    └── projects/
        └── sasaeru-firebase/
            ├── status.md
            ├── phase1-strategy/
            ├── phase2-design/
            ├── phase3-plan/
            ├── phase4-build/
            ├── phase5-quality/
            └── phase6-ship/
                ├── 仕様書_SASAERU.md          ← 本ファイル
                ├── テスト結果_SASAERU.md
                ├── 目視テストチェックシート_SASAERU.md
                ├── システム評価レポート_SASAERU.md
                └── 運用手順書_SASAERU.md
```

> **注意:** `config.js` はローカル開発用ファイルであり `.gitignore` で管理。本番（Netlify）では Snippet Injection で `window.SASAERU_CONFIG` を直接注入するため、`<script src="config.js">` タグは全ページから削除済み。

---

## 3. データベース設計（Firestoreコレクション）

### 3.1 organizations コレクション

**説明:** 地域クラブ団体の情報を管理する。ステータスにより公開制御。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `name` | string | 必須 | クラブ名 |
| `category` | string | 必須 | `sports` / `culture` / `welfare` / `other` |
| `area` | string | 必須 | 活動地域（例：島根県松江市） |
| `contact_email` | string | 必須 | クラブ担当者のメールアドレス |
| `activity_how` | string | 必須 | クラブ紹介・現状・課題説明 |
| `main_image` | string | 任意 | メイン画像URL（Cloudinary URL / null可） |
| `tags` | array(string) | 任意 | 支援ニーズタグ（例：「コーチ不足」「備品不足」） |
| `owner_uid` | string | 必須 | Firebase Auth UID（登録者のユーザーID） |
| `status` | string | 必須 | `pending`（審査中） / `public`（公開中） / `rejected`（却下済み） |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（登録日時） |
| `updated_at` | timestamp | 任意 | Firestore ServerTimestamp（更新日時、管理者承認・却下時に付与） |

**ステータス遷移:**
```
一般ユーザー申請
    ↓
pending（審査中）
    ↓ 管理者承認       ↓ 管理者却下
public（公開中）    rejected（却下済み）
    ↓ 管理者操作
pending（非公開化）
```

### 3.2 inquiries コレクション

**説明:** 企業・法人からの支援申請情報を管理する。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `org_id` | string | 必須 | 支援対象クラブのFirestore ドキュメントID |
| `company_name` | string | 必須 | 申請企業名・団体名 |
| `pic_name` | string | 必須 | 担当者名 |
| `sender_email` | string | 必須 | 担当者メールアドレス |
| `phone` | string | 任意 | 担当者電話番号（null可） |
| `message` | string | 必須 | 支援内容・メッセージ |
| `status` | string | 必須 | `new`（未対応） / `done`（対応済み） |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（申請日時） |

### 3.3 contacts コレクション

**説明:** 公開サイトのフッターお問い合わせフォームからの送信データ。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `name` | string | 必須 | お名前・会社名 |
| `email` | string | 必須 | メールアドレス |
| `message` | string | 必須 | お問い合わせ内容 |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（送信日時） |

### 3.4 organizations/{orgId}/menus サブコレクション

**説明:** 各クラブが設定する支援メニュー。公開設定により表示を制御する。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `title` | string | 必須 | メニュータイトル（例：ユニフォームスポンサー） |
| `support_type` | string | 必須 | `資金` / `物品` / `人材` / `場所` / `その他` |
| `target_amount` | string | 任意 | 希望金額・数量（例：50,000円 / ボール10個） |
| `description` | string | 必須 | 支援内容の詳細説明 |
| `return_merit` | string | 任意 | 支援者へのリターン・特典内容 |
| `status` | string | 必須 | `public`（公開） / `private`（非公開） |
| `created_at` | timestamp | 任意 | 作成日時（新規追加時のみ付与） |
| `updated_at` | timestamp | 任意 | 更新日時 |

### 3.5 posts コレクション（活動日記）

**説明:** クラブオーナーが投稿する活動日記。全公開コンテンツ。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `org_id` | string | 必須 | 所属 organizations ドキュメントID |
| `owner_uid` | string | 必須 | Firebase Auth UID（投稿者） |
| `title` | string | 必須 | 投稿タイトル |
| `content` | string | 必須 | 本文（改行あり） |
| `image_url` | string | 任意 | サムネイル画像URL（Cloudinary URL / null可） |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（投稿日時） |
| `updated_at` | timestamp | 任意 | 更新日時 |

### 3.6 セキュリティルール（v2.0現在）

ファイル: `firestore.rules`

| コレクション | 操作 | 許可条件 | 備考 |
|------------|------|---------|-----|
| organizations | get（1件取得） | `status == "public"` の場合は誰でも可。認証済みユーザーは全ステータス可 | |
| organizations | list（一覧取得） | **誰でも可（`if true`）** | v1.5で `if isAuth()` から変更。未認証の公開クラブ一覧表示に必要 |
| organizations | create（新規作成） | 認証済み + `owner_uid` == 自分のUID + `status == "pending"` | |
| organizations | update（更新） | `isAdmin()` または `isOwnerOf(orgId)` | |
| organizations | delete（削除） | `isAdmin()` のみ | |
| organizations/menus | get（1件取得） | `status == "public"` は誰でも可 / `isOwnerOf(orgId)` は全件可 | |
| organizations/menus | list（一覧取得） | **誰でも可（`if true`）** | v1.5で `if isOwnerOf(orgId)` から変更。公開クラブ詳細ページでのメニュー表示に必要 |
| organizations/menus | create / update / delete | `isOwnerOf(orgId)` のみ | |
| posts | read | 誰でも可（全公開コンテンツ） | |
| posts | create | 認証済み + `owner_uid` == 自分のUID | |
| posts | update / delete | 認証済み + `owner_uid` == 自分のUID（自分の投稿のみ） | |
| inquiries | create | 誰でも可（企業・匿名ユーザーが支援申請できる） | |
| inquiries | read / update / delete | `isAdmin()` のみ（個人情報保護） | |
| contacts | create | 誰でも可 | |
| contacts | read / update / delete | `isAdmin()` のみ（個人情報保護） | |

**ヘルパー関数定義:**
```javascript
function isAuth() {
  return request.auth != null;
}

// Custom Claims による管理者判定
// 付与方法: Firebase Admin SDK で setCustomUserClaims(uid, { admin: true })
function isAdmin() {
  return isAuth() && request.auth.token.admin == true;
}

// 対象組織のオーナー判定
function isOwnerOf(orgId) {
  return isAuth() &&
    get(/databases/$(database)/documents/organizations/$(orgId)).data.owner_uid == request.auth.uid;
}
```

---

## 4. 画面仕様

### 4.1 公開サイト（index.html）

#### メタ情報
- `<title>`: SASAERU | 地域クラブ活動支援プラットフォーム
- OGP タグ: `og:title` / `og:description` / `og:image` / `og:url` / `twitter:card`
- canonical リンク

#### ナビゲーション

- ロゴ（SASAERUロゴ + ハートアイコン）
- デスクトップナビリンク: SASAERUとは / クラブを探す / 企業の方へ / お問い合わせ
- 認証状態によりヘッダー右側を切り替え:
  - **未ログイン時（`header-guest`）**: 「ログイン」ボタン + 「団体登録（無料）」ボタン
  - **ログイン済み時（`header-user`）**: ログイン中メールアドレス表示 + 「マイページ」ボタン（→ mypage.html）
- モバイル: ハンバーガーメニュー（トグル開閉、認証状態で表示切り替え）
- 背景色: `#0f0e2e`（深紺）、sticky固定 z-index: 50

#### クラブ一覧データ取得（v1.5変更）

```javascript
// .get() から .onSnapshot() に変更（BFCache・キャッシュタイミング問題の解消）
db.collection('organizations')
  .where('status', '==', 'public')
  .limit(50)
  .onSnapshot(snap => {
    allOrgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.created_at?.toMillis?.()??0) - (a.created_at?.toMillis?.()??0));
    renderOrgs();
  }, err => { /* エラー表示 */ });
```

- `orderBy` は使用せず、クライアント側で `created_at` 降順ソート（Firestore 複合インデックス不要）
- エラー時は「データの取得に失敗しました」と「再試行」ボタンを表示

#### 支援申請モーダル

- club.html の「支援・問い合わせ」ボタン、または活動日記詳細モーダルの支援ボタンからも起動可

#### フッター

| リンク | 遷移先 |
|-------|-------|
| 利用規約 | `terms.html` |
| プライバシーポリシー | `privacy.html` |
| 運営団体について | `https://www.scl.or.jp/`（外部リンク / target="_blank"） |

---

### 4.2 クラブ詳細ページ（club.html）

**URL形式:** `club.html?id=ORG_ID`  
**認証:** 不要（公開ページ）

#### 表示フロー

1. URLパラメータ `id` からORG_IDを取得
2. `organizations/{id}` を Firestore から取得
3. `status !== 'public'` または存在しない場合はエラー表示
4. `organizations/{id}/menus`（`status == 'public'`）と `posts`（`org_id == id`, `created_at` 降順, limit 20）を並列取得
5. ページを描画

#### ページセクション構成

| セクション | 要素 |
|----------|------|
| ナビゲーション | ロゴ・ナビリンク・認証状態切り替えヘッダー |
| ヒーロー | メイン画像・クラブ名・カテゴリバッジ・エリア・ニーズタグ・「このクラブを応援する」ボタン |
| クラブ紹介 | `activity_how` の本文（改行・段落対応） |
| 支援メニュー（#support-menus） | menusカード一覧（support_type アイコン・title・target_amount・description・return_merit・「支援・問い合わせ」ボタン） |
| 活動日記 | postsカード一覧（画像・日付・title・content 3行クランプ・「続きを読む」テキスト）。**カードクリックで詳細モーダルを開く** |
| CTAバナー | 支援申請モーダルを開くボタン（深紺背景） |
| フォローティングCTA | モバイル専用の固定ボタン「このクラブを応援する」 |
| フッター | 団体一覧リンク・ロゴ・コピーライト・利用規約・プライバシー・運営団体リンク |

#### 活動日記詳細モーダル（v2.0追加）

ID: `post-modal`  
トリガー: 活動日記カードのクリック → `openPostModal(postId)`  
データ: `_postCache` Map（`posts.forEach(p => _postCache.set(p.id, p))`）からIDで取得  
閉じる: ×ボタン / モーダル背景クリック / ESCキー

**モーダル表示要素:**

| 要素 | 詳細 |
|-----|------|
| 画像 | `p.image_url` がある場合に表示（`max-h-72 object-cover`）。ロード失敗時は非表示 |
| 日付 | `formatDate(p.created_at)` |
| タイトル | `p.title` |
| 本文 | `p.content`（`whitespace-pre-wrap` で改行を維持）—— 全文表示 |
| 支援ボタン | 「このクラブを応援する・支援申請をする」→ モーダルを閉じて `openInquiryModal()` を呼び出し |

**`_postCache` 実装:**
```javascript
const _postCache = new Map();
// loadPosts() 内:
_postCache.clear();
posts.forEach(p => _postCache.set(p.id, p));
// カード onclick:
onclick="openPostModal('${esc(p.id)}')"
```

#### エラー表示

| 条件 | メッセージ |
|-----|---------|
| `id` パラメータなし | 「URLにクラブIDが指定されていません」 |
| ドキュメント未存在 | 「指定されたクラブは存在しません」 |
| `status !== 'public'` | 「このページは非公開です」 |

---

### 4.3 マイページ（mypage.html）

**認証制御:** 未ログイン時は `index.html` へリダイレクト  
**robots:** `noindex,nofollow`（検索エンジンにインデックスさせない）

#### 認証フロー（v2.0更新）

```javascript
// ページロード時: Promise ベース one-shot 認証チェック
new Promise(resolve => {
  const unsub = auth.onAuthStateChanged(user => { unsub(); resolve(user); });
}).then(async user => {
  if (!user) { window.location.replace('index.html'); return; }
  // 管理者は admin.html へリダイレクト
  const token = await user.getIdTokenResult();
  if (token.claims.admin === true) { window.location.replace('admin.html'); return; }
  loadUserOrg(user.uid);
});

// BFCache 対策（v2.0追加）: キャッシュから復元された場合も認証チェック
window.addEventListener('pageshow', e => {
  if (e.persisted && auth && !auth.currentUser) {
    window.location.replace('index.html');
  }
});
```

#### ログアウト（v2.0更新）

```javascript
async function doSignOut() {
  if (auth) await auth.signOut();
  window.location.replace('index.html'); // history.replaceState: 戻るボタンで戻れなくする
}
```

#### 3タブ構成

| タブ | ID | 内容 |
|-----|-----|-----|
| プロフィール | `tab-profile` | 団体情報編集フォーム・ステータスバナー表示 |
| 支援メニュー | `tab-menus` | menus サブコレクション CRUD |
| 活動日記 | `tab-diary` | posts コレクション CRUD |

#### 支援メニュー / 活動日記のIDキャッシュパターン（v1.5）

onclick にオブジェクトを JSON シリアライズして埋め込む代わりに、ID ベースの Map キャッシュを使用（XSS リスクの排除）。

```javascript
// メニューキャッシュ
const _menuCache = new Map();
// renderMenuCards() 内:
_menuCache.clear();
menus.forEach(m => _menuCache.set(m.id, m));
// カード onclick:
onclick="editMenu('${esc(m.id)}')"
// 関数:
function editMenu(menuId) {
  const menuData = _menuCache.get(menuId);
  ...
}

// 日記も同様: _diaryCache Map
```

#### Cloudinary 画像アップロード（v1.5）

- 対象: プロフィール画像・活動日記サムネイル
- 方式: Unsigned upload（Cloudinary preset: `window.SASAERU_CONFIG.cloudinaryPreset`）
- フロー: `<input type="file">` → `fetch POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload` → レスポンスの `secure_url` を設定
- 設定値: `window.SASAERU_CONFIG.cloudinaryCloudName` / `cloudinaryPreset`（Netlify Snippet Injection で注入）

---

### 4.4 管理ダッシュボード（admin.html）

**認証制御:** Firebase Auth + Custom Claims (`admin: true`) 必須  
**robots:** `noindex,nofollow`

#### 認証フロー

**認証ヘルパー `verifyAdminAndShow(user, errEl)`:**
1. `user.getIdTokenResult(true)` で最新トークンを強制取得
2. `claims.admin === true` なら `showDashboard(user)`
3. それ以外なら `auth.signOut()` → `showLogin()` → errEl にエラー表示

#### 団体ステータス更新（v1.5更新）

`approveOrg()` / `rejectOrg()` / `changeOrgStatus()` いずれも `updated_at: firebase.firestore.FieldValue.serverTimestamp()` を付与。

#### サイドバーナビ

固定幅 `w-60`（240px）、背景色: `#0f0e2e`  
ナビゲーションメニュー: 概要 / 審査待ち / 団体管理 / 支援申請 / お問い合わせ  
バッジ表示: 「審査待ち」にオレンジバッジ（件数）、「支援申請」にブルーバッジ（未対応件数）

#### ステータスバッジ定義

| status値 | ラベル | スタイル |
|---------|-------|---------|
| pending | 審査中 | bg-amber-100 text-amber-600 |
| public | 公開中 | bg-green-100 text-green-700 |
| rejected | 却下 | bg-red-100 text-red-600 |
| new | 未対応 | bg-blue-50 text-blue-600 |
| done | 対応済み | bg-green-50 text-green-600 |

---

### 4.5 利用規約（terms.html）— v1.5追加

**運営者:** 一般社団法人しまね創生ラボ  
**内容:** 全11条（適用・利用条件・禁止事項・免責・準拠法 等）  
**デザイン:** サイト統一デザイン（Tailwind / 深紺 #0f0e2e / オレンジアクセント）  
**フッター:** 利用規約 / プライバシーポリシー / 運営団体リンクあり

---

### 4.6 プライバシーポリシー（privacy.html）— v1.5追加

**運営者:** 一般社団法人しまね創生ラボ  
**内容:** 全11条（個人情報保護法準拠）  
**外部サービス情報テーブル:**

| サービス名 | 用途 | プライバシーポリシー |
|----------|------|------------------|
| Firebase（Google） | 認証・データベース | https://policies.google.com/privacy |
| Cloudinary | 画像保存・配信 | https://cloudinary.com/privacy |
| Netlify | ホスティング | https://www.netlify.com/privacy/ |
| EmailJS | メール通知 | https://www.emailjs.com/legal/privacy-policy/ |

---

## 5. 機能仕様

### 5.1 団体登録フロー（申請→審査→公開）

```
[一般ユーザー]
  1. 公開サイトのクラブ登録ボタンをクリック
  2. 登録モーダルでフォーム入力（クラブ名・カテゴリ・地域・メール・パスワード・紹介文）
  3. 「登録申請する」送信
  4. Firebase Auth でアカウント作成（createUserWithEmailAndPassword）
  5. Firestore organizations に status=pending で保存
  6. 管理者へ Slack / EmailJS 通知

[管理者]
  7. admin.html の審査待ちタブで申請を確認（Slack通知で気付く）
  8. 内容を審査
  9a. 承認 → status を public に更新（updated_at 付与）→ 公開サイトに表示される
  9b. 却下 → status を rejected に更新（updated_at 付与）→ 非公開のまま
```

### 5.2 支援申請フロー

```
[企業ユーザー]
  1. 公開サイトのクラブ一覧からクラブを選択
  2. club.html の「応援する」ボタン、または活動日記詳細モーダルの支援ボタンをクリック
  3. 支援申請モーダルでフォーム入力（企業名・担当者・メール・支援内容）
  4. 「申請する」送信
  5. Firestore inquiries に status=new で保存
  6. 管理者へ Slack / EmailJS 通知

[管理者]
  7. admin.html の支援申請タブで確認（Slack通知で気付く）
  8. 「返信する」(mailto:) で企業担当者へメール
  9. 「対応済みにする」で status を done に更新
```

### 5.3 管理者通知（v1.5追加）

**通知対象イベント:**

| イベント | 通知内容 |
|--------|---------|
| クラブ登録申請 | クラブ名・カテゴリ・エリア・メール |
| 支援申請 | 企業名・担当者・クラブ名・メッセージ |
| お問い合わせ | 氏名・メール・本文 |

**通知手段:**
1. **Slack Webhook** (`slackWebhook`): `fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ text }) })`
2. **EmailJS** (`emailjsPublicKey` / `emailjsServiceId` / `emailjsTemplateId`): `emailjs.send(serviceId, templateId, params)`

**設定値の取得:**
```javascript
function getCfg() { return window.SASAERU_CONFIG || {}; }
// 呼び出し時にlazy取得（スクリプト初期化時ではなく関数実行時に読む）
```

### 5.4 認証フロー（v2.0更新）

```
【新規登録】
フォーム入力（メール・パスワード・クラブ情報）
  ↓
Auth.createUserWithEmailAndPassword(email, password)
  ↓
Firestore organizations コレクションに保存（owner_uid: cred.user.uid, status: 'pending'）
  ↓
mypage.html へ遷移

【ログイン】
フォーム入力（メール・パスワード）
  ↓
Auth.signInWithEmailAndPassword(email, password)
  ↓
mypage.html へ遷移

【ログアウト（v2.0更新）】
auth.signOut()
  ↓
window.location.replace('index.html')  // history エントリを置換
  ↓
pageshow イベントリスナーが BFCache 復元時も auth チェック

【戻るボタン対策（v2.0追加）】
window.addEventListener('pageshow', e => {
  if (e.persisted && auth && !auth.currentUser) {
    window.location.replace('index.html');  // 未ログインなら強制リダイレクト
  }
});
```

### 5.5 クラブ詳細 → 活動日記詳細フロー（v2.0追加）

```
club.html 読み込み
  ↓
loadPosts(orgId)
  ↓
_postCache.clear(); posts.forEach(p => _postCache.set(p.id, p));
  ↓
各カード: onclick="openPostModal('POST_ID')"

【カードクリック】
openPostModal(postId)
  ↓
_postCache.get(postId) でデータ取得
  ↓
post-modal に: 画像 / 日付 / タイトル / 全文 を表示
  ↓
支援ボタン onclick: closePostModal() → openInquiryModal()
```

### 5.6 設定値の管理（v2.0更新）

**ローカル開発:**
- `config.js` ファイルに `window.SASAERU_CONFIG = { ... }` を定義（.gitignore 対象）

**本番（Netlify）:**
- Netlify ダッシュボード → Site settings → Snippet Injection → `</head>` の前に以下を注入:
  ```html
  <script>
  window.SASAERU_CONFIG = {
    slackWebhook: "https://hooks.slack.com/services/...",
    emailjsPublicKey: "...",
    emailjsServiceId: "...",
    emailjsTemplateId: "...",
    cloudinaryCloudName: "...",
    cloudinaryPreset: "..."
  };
  </script>
  ```
- **全ページから `<script src="config.js">` タグは削除済み**（v2.0）
  - 削除理由: Netlify では `config.js` ファイルが存在しないため、リクエストに対してホスティングが HTML の 404 ページを返し、`Refused to execute script ... MIME type ('text/html')` エラーが発生していた

---

## 6. セキュリティ設計

### 6.1 アクセス制御マトリクス（v2.0現在）

| コレクション | 操作 | 許可条件 |
|------------|------|---------|
| organizations | get | `status == "public"` は全員 / 認証済みは全ステータス |
| organizations | list | **全員（`if true`）** ← v1.5変更 |
| organizations | create | 認証済み + `owner_uid` == 自分 + `status == "pending"` |
| organizations | update | `isAdmin()` または `isOwnerOf(orgId)` |
| organizations | delete | `isAdmin()` のみ |
| organizations/menus | get | `status == "public"` は全員 / `isOwnerOf(orgId)` は全件 |
| organizations/menus | list | **全員（`if true`）** ← v1.5変更 |
| organizations/menus | write | `isOwnerOf(orgId)` のみ |
| posts | read | 誰でも可（全公開） |
| posts | create | 認証済み + `owner_uid` == 自分 |
| posts | update / delete | 認証済み + `owner_uid` == 自分 |
| inquiries | create | 誰でも可 |
| inquiries | read / update / delete | `isAdmin()` のみ |
| contacts | create | 誰でも可 |
| contacts | read / update / delete | `isAdmin()` のみ |

### 6.2 XSS対策（esc()関数）

全ファイルに共通の `esc()` 関数を実装。Firestoreから取得したデータをHTMLに埋め込む際はすべて `esc()` でエスケープ。

```javascript
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])
  );
}
```

onclick 属性の値には `esc(id)` のみを渡し、オブジェクト全体は onclick 属性に埋め込まない（ID キャッシュパターン）。

### 6.3 セキュリティヘッダー（netlify.toml）

| ヘッダー名 | 値 | 効果 |
|----------|-----|-----|
| `X-Frame-Options` | `DENY` | クリックジャッキング防止 |
| `X-Content-Type-Options` | `nosniff` | MIMEスニッフィング攻撃防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー情報の漏洩制限 |

### 6.4 管理者・マイページのbot対策

```html
<meta name="robots" content="noindex,nofollow">
```

`admin.html` / `mypage.html` に設定。検索エンジンのインデックス・リンクの追跡を防止。

---

## 7. インフラ・デプロイ

### 7.1 ホスティング（Netlify）

```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

### 7.2 データベース（Firebase Firestore）

| 項目 | 設定値 |
|-----|-------|
| プロジェクトID | `sasaeru-7f375` |
| リージョン | asia-northeast1（東京） |
| モード | Native モード |
| SDK | Firebase v10.12.2 compat |

**Firestoreインデックス（`firestore.indexes.json`）:**

| コレクション | フィールド1 | フィールド2 | 状態 | 用途 |
|------------|----------|----------|------|-----|
| posts | org_id ASC | created_at DESC | ✅ デプロイ済み | 活動日記一覧取得 |

### 7.3 デプロイフロー

**フロントエンド（Netlify 自動デプロイ）:**
```
git push (main) → GitHub → Netlify CI/CD → 本番反映（数十秒）
```

**Firestore ルール・インデックス（Firebase CLI 手動）:**
```bash
firebase deploy --only firestore:rules    # ルールのみ
firebase deploy --only firestore:indexes  # インデックスのみ
firebase deploy --only firestore          # 両方
```

> Firestoreルール・インデックスは git push では自動デプロイされない。変更時は必ず Firebase CLI で実施。

---

## 8. 運用・保守

### 8.1 管理者アカウント管理

1. Firebase Console（Authentication）でメール/パスワードアカウントを作成
2. Firebase Admin SDK で Custom Claims を付与（**必須**）:
   ```javascript
   await admin.auth().setCustomUserClaims('管理者のUID', { admin: true });
   ```
3. 管理者が一度ログアウト → 再ログイン（`admin.html` は `getIdTokenResult(true)` で即時反映）

**権限剥奪:**
```javascript
await admin.auth().setCustomUserClaims('対象UID', {});
```

### 8.2 Slack 通知チャンネル変更手順

1. Slack ワークスペースで変更先チャンネルの Incoming Webhook URL を発行
2. Netlify ダッシュボード → Site settings → Snippet Injection → `slackWebhook` の値を新しい URL に更新
3. 保存後、Netlify が自動再デプロイ（または「Trigger deploy」で手動反映）

### 8.3 Firestoreインデックス管理

| コレクション | フィールド1 | フィールド2 | 用途 |
|------------|----------|----------|-----|
| posts | org_id ASC | created_at DESC | マイページ・club.html の活動日記一覧 |

---

## 付録A: Firebase プロジェクト情報

| 項目 | 値 |
|-----|---|
| Project ID | `sasaeru-7f375` |
| Auth Domain | `sasaeru-7f375.firebaseapp.com` |
| Storage Bucket | `sasaeru-7f375.firebasestorage.app` |
| Messaging Sender ID | `51698278682` |
| App ID | `1:51698278682:web:7ebcac3c2d90fc04edcca3` |

---

## 付録B: カテゴリ定義

| 値 | 表示ラベル | 対象活動例 |
|----|---------|---------|
| `sports` | スポーツ | サッカー・野球・バスケットボール・水泳など |
| `culture` | 文化・芸術 | 伝統芸能・音楽・美術・演劇など |
| `welfare` | 福祉 | 障害者支援・高齢者支援・ボランティアなど |
| `other` | その他 | 上記に分類されない活動 |

---

## 付録C: 支援タイプ定義（menus.support_type）

| 値 | アイコン | 説明 |
|----|---------|-----|
| `資金` | 💰 | 活動資金・補助金などの金銭支援 |
| `物品` | 📦 | 用具・ユニフォーム・備品などの現物支援 |
| `人材` | 👥 | コーチ・指導者・ボランティアなどの人的支援 |
| `場所` | 📍 | 練習場所・施設の提供 |
| `その他` | 🤝 | 上記に分類されない支援 |

---

*本仕様書はG-Stack AIチームのSpec Writerエージェントにより管理されています。*  
*最終更新: 2026-04-21 / v2.0*
