# SASAERU システム仕様書

**バージョン:** 1.4  
**作成日:** 2026-04-16  
**更新日:** 2026-04-16  
**作成者:** G-Stack AI チーム / Spec Writer  
**ステータス:** 確定版

---

## 変更サマリー（v1.0 → v1.1）

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | `club.html`・`mypage.html` をファイル構成に追加 | 2章 |
| 2 | `organizations` コレクションに `owner_uid` フィールドを追加 | 3章 |
| 3 | `organizations/{orgId}/menus` サブコレクション（支援メニュー）の設計を追加 | 3章 |
| 4 | `posts` コレクション（活動日記）の設計を追加 | 3章 |
| 5 | クラブ詳細ページ（club.html）の画面仕様を追加 | 4章 |
| 6 | マイページ（mypage.html）の画面仕様を追加 | 4章 |
| 7 | index.html の認証機能（ログイン・登録フロー）を追記 | 4章 |
| 8 | 認証フロー・クラブ詳細表示フロー・マイページ操作フローを追加 | 5章 |
| 9 | Firestoreセキュリティルールをオーナー制御対応版に更新 | 6章 |

## 変更サマリー（v1.1 → v1.2）

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | `isAdmin()` を Custom Claims (`request.auth.token.admin == true`) ベースに変更 | 3章 |
| 2 | `organizations` の update/delete ルールを管理者・オーナー限定に強化 | 3章 |
| 3 | `inquiries`/`contacts` の read/update/delete を isAdmin() のみに変更 | 3章 |
| 4 | admin.html のクライアント側 Custom Claims 検証フロー追記 | 4章 |
| 5 | admin.html / mypage.html モバイル対応サイドバー仕様を追記 | 4章 |
| 6 | mypage.html 公開ページリンクのバグ修正（`club.html?id=` に変更） | 4章 |
| 7 | club.html モバイルメニュー認証状態対応を追記 | 4章 |

## 変更サマリー（v1.2 → v1.3）

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | mypage.html・admin.html の認証チェックを Promise ベース（one-shot）に変更し race condition を解消 | 4章 |
| 2 | admin.html Custom Claims チェックから `auth.signOut()` を除去（ループ防止） | 4章 |
| 3 | admin.html `getIdTokenResult(true)` で強制トークンリフレッシュに変更 | 4章 |
| 4 | Firestore menus サブコレクションルールを `allow get` / `allow list` に分離 | 3章 |
| 5 | index.html の `SAMPLE_ORGS`（仮クラブ3件）を削除し、空リストフォールバックに変更 | 4章 |
| 6 | mypage.html の `DEMO_ORG`/`DEMO_MENUS`/`DEMO_POSTS` を削除 | 4章 |
| 7 | Firebase未設定時の mypage.html フォールバックを no-org-screen 表示に変更 | 4章 |

## 変更サマリー（v1.3 → v1.4）

| # | 変更内容 | 対象章 |
|---|---------|-------|
| 1 | `firebase.json` / `.firebaserc` を追加し Firebase CLI デプロイ環境を整備 | 7章 |
| 2 | `firestore.rules` を Firebase へ初回デプロイ（未デプロイによる権限エラーを解消） | 3章・7章 |
| 3 | `firestore.indexes.json` を追加・デプロイ（posts の `org_id + created_at` 複合インデックス） | 3章・7章 |
| 4 | admin.html 認証ロジックを `verifyAdminAndShow()` ヘルパーに一本化 | 4章 |
| 5 | admin.html ログアウト: `signOut()` 後に `showLogin()` を明示呼び出し（Promise ベースで listener 不在のため） | 4章 |
| 6 | 仕様書 5.4 のデモモード説明を現状に合わせ修正（サンプルデータ削除済みを反映） | 5章 |
| 7 | 仕様書 8.1 の管理者アカウント管理を Custom Claims 必須に更新 | 8章 |

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
| コピーライト | 2025 SASAERU Project All Rights Reserved |

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

### 1.4 フェーズ定義

#### Phase 1（現行）
- 地域クラブの情報掲載（登録申請・審査・公開）
- 企業からの支援申請受付
- 管理者によるマッチング仲介
- お問い合わせフォーム

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
┌─────────────────────────────────────────────────────┐
│                    ユーザーブラウザ                    │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │   index.html     │   │      admin.html        │  │
│  │  (公開サイト)     │   │  (管理ダッシュボード)   │  │
│  └────────┬─────────┘   └───────────┬────────────┘  │
└───────────┼──────────────────────────┼───────────────┘
            │                          │
            │   Firebase v10 compat SDK (CDN)
            │                          │
┌───────────▼──────────────────────────▼───────────────┐
│                  Firebase (GCP: asia-northeast1)      │
│  ┌────────────────────┐   ┌────────────────────────┐  │
│  │  Firestore         │   │  Firebase Auth         │  │
│  │  - organizations   │   │  メール/パスワード認証   │  │
│  │  - inquiries       │   │  （管理者のみ）         │  │
│  │  - contacts        │   └────────────────────────┘  │
│  └────────────────────┘                               │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                    Netlify (ホスティング)                │
│  - 静的ファイル配信 (index.html / admin.html)           │
│  - CDNエッジ配信                                        │
│  - セキュリティヘッダー付与                              │
│  - Git push による自動デプロイ                           │
└────────────────────────────────────────────────────────┘
```

### 2.2 使用技術スタック

| カテゴリ | 技術 | バージョン / 詳細 |
|---------|------|----------------|
| フロントエンド | HTML5 / Vanilla JavaScript | - |
| CSSフレームワーク | Tailwind CSS | CDN版（tailwindcss.com） |
| アイコン | Lucide Icons | unpkg.com/lucide@latest |
| フォント | Noto Sans JP | Google Fonts（400/500/700/900） |
| データベース | Firebase Firestore | v10.12.2 compat SDK |
| 認証 | Firebase Auth | v10.12.2 compat SDK（管理者・クラブオーナー共通）、Custom Claims でロール管理 |
| ホスティング | Netlify | 静的サイト配信 |
| バックエンド | なし（フルサーバーレス） | - |

### 2.3 ファイル構成一覧

```
SASAERU/
├── index.html              # 公開サイト（メインページ）
├── admin.html              # 管理ダッシュボード
├── club.html               # クラブ詳細ページ（公開）
├── mypage.html             # クラブオーナー マイページ
├── firestore.rules         # Firestore セキュリティルール（Firebase にデプロイ済み）
├── firestore.indexes.json  # Firestore 複合インデックス定義（デプロイ済み）
├── firebase.json           # Firebase CLI 設定
├── .firebaserc             # Firebase プロジェクト紐付け（sasaeru-7f375）
├── .gitignore              # Firebase サービスアカウントキー等を除外
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
                └── 仕様書_SASAERU.md  ← 本ファイル
```

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
| `main_image` | string | 任意 | メイン画像URL（null可） |
| `tags` | array(string) | 任意 | 支援ニーズタグ（例：「コーチ不足」「備品不足」） |
| `owner_uid` | string | 必須 | Firebase Auth UID（登録者のユーザーID） |
| `status` | string | 必須 | `pending`（審査中） / `public`（公開中） / `rejected`（却下済み） |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（登録日時） |

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

### 3.5 organizations/{orgId}/menus サブコレクション

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

### 3.6 posts コレクション（活動日記）

**説明:** クラブオーナーが投稿する活動日記。全公開コンテンツ。

| フィールド名 | 型 | 必須 | 備考 |
|-----------|-----|------|-----|
| `org_id` | string | 必須 | 所属 organizations ドキュメントID |
| `owner_uid` | string | 必須 | Firebase Auth UID（投稿者） |
| `title` | string | 必須 | 投稿タイトル |
| `content` | string | 必須 | 本文（改行あり） |
| `image_url` | string | 任意 | サムネイル画像URL（null可） |
| `created_at` | timestamp | 必須 | Firestore ServerTimestamp（投稿日時） |
| `updated_at` | timestamp | 任意 | 更新日時 |

### 3.7 セキュリティルール説明（更新版）

ファイル: `firestore.rules`

| コレクション | 操作 | 許可条件 |
|------------|------|---------|
| organizations | get（1件取得） | `status == "public"` の場合は誰でも可。認証済みユーザーは全ステータス可 |
| organizations | list（一覧取得） | 認証済みユーザーのみ（マイページの owner_uid クエリ + 管理者の全件取得に必要） |
| organizations | create（新規作成） | 認証済み + `owner_uid` == 自分のUID + `status == "pending"` |
| organizations | update（更新） | `isAdmin()` または `isOwnerOf(orgId)`（v1.2変更） |
| organizations | delete（削除） | `isAdmin()` のみ（v1.2変更） |
| organizations/menus | get（1件取得） | `status == "public"` は誰でも可 / `isOwnerOf(orgId)` は全件可 |
| organizations/menus | list（一覧取得） | `isOwnerOf(orgId)` のみ（v1.3変更: list では resource が null のため status チェック不可） |
| organizations/menus | create / update / delete | `isOwnerOf(orgId)` のみ |
| posts | read | 誰でも可（全公開コンテンツ） |
| posts | create | 認証済み + `owner_uid` == 自分のUID |
| posts | update / delete | 認証済み + `owner_uid` == 自分のUID（自分の投稿のみ） |
| inquiries | create | 誰でも可（企業・匿名ユーザーが支援申請できる） |
| inquiries | read / update / delete | `isAdmin()` のみ（v1.2変更・個人情報保護強化） |
| contacts | create | 誰でも可 |
| contacts | read / update / delete | `isAdmin()` のみ（v1.2変更・個人情報保護強化） |

**ヘルパー関数定義（v1.2/v1.3）:**
```javascript
// 認証済みユーザー判定
function isAuth() {
  return request.auth != null;
}

// Custom Claims による管理者判定（v1.2追加）
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

**管理者 Custom Claims 付与手順:**
```javascript
// Node.js / Firebase Admin SDK（サーバーサイドまたは Cloud Functions）
const admin = require('firebase-admin');
admin.initializeApp();

// 管理者として認定するユーザーの UID を指定
await admin.auth().setCustomUserClaims('TARGET_USER_UID', { admin: true });
// ※ 変更後、クライアントはトークン更新（最大1時間）まで反映待ち
// ※ 即時反映: user.getIdToken(true) で強制リフレッシュ
```

---

## 4. 画面仕様

### 4.1 公開サイト（index.html）

#### ナビゲーション

- ロゴ（SASAERUロゴ + ハートアイコン）
- デスクトップナビリンク: SASAERUとは / クラブを探す / 企業の方へ / お問い合わせ
- 認証状態によりヘッダー右側を切り替え:
  - **未ログイン時（`header-guest`）**: 「ログイン」ボタン（→ ログインモーダル） + 「団体登録（無料）」ボタン（→ 登録モーダル）
  - **ログイン済み時（`header-user`）**: ログイン中メールアドレス表示 + 「マイページ」ボタン（→ mypage.html）
- モバイル: ハンバーガーメニュー（トグル開閉、認証状態で表示切り替え）
- 背景色: `#0f0e2e`（深紺）、sticky固定 z-index: 50

#### ログインモーダル（login-modal）

トリガー: `openLoginModal()` 関数  
閉じる: ×ボタン / モーダル背景クリック / ESCキー

**ログインフォーム（login-form-view）:**

| フィールド | 入力タイプ | 必須 | 説明 |
|----------|----------|------|-----|
| メールアドレス | email | 必須 | Firebase Auth 用メールアドレス |
| パスワード | password | 必須 | Firebase Auth パスワード |

- 送信: `auth.signInWithEmailAndPassword` → 成功時 mypage.html へ遷移
- エラーメッセージ対応:
  - `auth/user-not-found`: メールアドレスが見つかりません
  - `auth/wrong-password`: パスワードが正しくありません
  - `auth/invalid-email`: メールアドレスの形式が正しくありません
  - `auth/too-many-requests`: しばらく時間をおいて再試行してください

**パスワードリセットフォーム（forgot-form-view）:**

- 「パスワードをお忘れの方」リンクで表示切り替え
- `auth.sendPasswordResetEmail(email)` → リセットメールを送信

#### 団体登録モーダル（登録フロー更新版）

**フォーム項目（v1.1追加: パスワード設定）:**

| フィールド | 入力タイプ | 必須 | 説明 |
|----------|----------|------|-----|
| クラブ名 | text | 必須 | `name` |
| カテゴリ | select | 必須 | `category` |
| 地域 | text | 必須 | `area` |
| 担当メールアドレス | email | 必須 | `contact_email`（Auth のメールアドレスにも使用） |
| パスワード設定 | password | 必須 | 6文字以上（Firebase Auth 用） |
| メイン画像URL | url | 任意 | `main_image` |
| 支援を求めている内容 | text | 任意 | `tags`（カンマ区切り） |
| クラブ紹介・現状 | textarea | 必須 | `activity_how` |

**送信処理（v1.1更新）:**
1. `auth.createUserWithEmailAndPassword(email, password)` → Firebase Auth ユーザー作成
2. `db.collection('organizations').add({ ...payload, owner_uid: cred.user.uid, status: 'pending' })`
3. 成功時: 「登録申請を受け付けました」を表示し2秒後に mypage.html へ遷移
4. エラーハンドリング:
   - `auth/email-already-in-use`: このメールアドレスは既に登録されています
   - `auth/weak-password`: パスワードは6文字以上にしてください

**クラブカード「詳細を見る」ボタン:**  
v1.0の「詳細・支援申請」ボタンを変更。`club.html?id=ORG_ID` へのリンクに変更。

#### ヒーローセクション

- 背景: グリッドパターン + ラジアルグロウ + Unsplash背景画像（子供たちの笑顔）
- キャッチコピー: 「地域の未来を、企業の力で支える。」
- サブコピー: 資金・コーチ不足の解消と企業マッチングの説明
- CTAボタン（2つ）:
  - 「支援したいクラブを探す」→ `#clubs` セクションへスクロール
  - 「活動内容を掲載する」→ クラブ登録モーダルを開く

**統計カウンターバー（4項目）:**

| ID | 表示内容 | データソース |
|----|---------|-------------|
| `stat-orgs` | 登録クラブ数 | Firestore `organizations` where status=public のcount。失敗時はサンプル数 |
| `stat-inquiries` | 支援申請数 | Firestoreのread権限なしのため常に `--` を表示 |
| （固定値） | 対応カテゴリ | 固定値: `3` |
| （固定値） | 掲載費用 | 固定値: `無料` |

カウンターアニメーション: 0から目標値まで段階的に増加（`setInterval` 40ms）

#### 三方良しセクション（#about）

「なぜSASAERUなのか」として、地域クラブ・企業/法人・学校/子どもの3者への価値提供を3カードで表示。  
中央の企業カードは `scale-105` で強調表示。

#### 団体一覧（#clubs）

- タブフィルター（すべて / スポーツ / 文化・芸術 / 福祉）
- カード表示: 3列グリッド（レスポンシブ）
- 各カードの表示要素: サムネイル画像・カテゴリバッジ・地域・クラブ名・ニーズタグ・紹介文（3行クランプ）・「詳細・支援申請」ボタン
- 「詳細・支援申請」ボタン → 支援申請モーダルを開く
- データ取得: Firestore `organizations` where status=public, orderBy created_at desc, limit 30。取得失敗時またはFirebase未設定時はサンプルデータ3件を表示（デモモード）

**カテゴリカラー定義:**
| カテゴリ | バッジスタイル |
|---------|-------------|
| sports | bg-blue-50 text-blue-700 border-blue-100 |
| culture | bg-purple-50 text-purple-700 border-purple-100 |
| welfare | bg-green-50 text-green-700 border-green-100 |
| other | bg-slate-50 text-slate-700 border-slate-100 |

#### 団体登録CTA

オレンジグラデーション背景の全幅CTAバナー。「クラブを無料登録する」ボタン → クラブ登録モーダルを開く。

#### 企業向けセクション（#for-company）

背景: `#0f0e2e`（深紺）  
左: 企業向けメリット3項目（利益活用・企業PR・地域貢献）  
右: 支援開始までの3ステップ（クラブを探す → 申請 → マッチング）

#### フッター・お問い合わせフォーム（#contact）

左: ロゴ・説明文・住所・メールアドレス  
右: お問い合わせフォーム（contacts コレクションへ保存）  
下部: コピーライト・利用規約・プライバシーポリシー・運営団体について リンク

#### 団体登録モーダル（クラブ登録フォーム）

ID: `register-modal`  
トリガー: `openRegisterModal()` 関数  
閉じる: ×ボタン / モーダル背景クリック / ESCキー

**フォーム項目一覧:**

| フィールド | 入力タイプ | 必須 | 説明 |
|----------|----------|------|-----|
| クラブ名 | text | 必須 | `name` |
| カテゴリ | select | 必須 | `category`: スポーツ / 文化・芸術 / 福祉 / その他 |
| 地域 | text | 必須 | `area`（例：島根県松江市） |
| 担当メールアドレス | email | 必須 | `contact_email` |
| メイン画像URL | url | 任意 | `main_image`（https://... 形式） |
| 支援を求めている内容 | text | 任意 | `tags`（カンマ区切りで複数入力可） |
| クラブ紹介・現状 | textarea | 必須 | `activity_how`（4行） |

**送信処理:**
- `status: "pending"` で Firestore `organizations` コレクションに追加
- `created_at: firebase.firestore.FieldValue.serverTimestamp()` を使用
- 成功時: 「登録申請を受け付けました」を表示し3秒後にモーダルを閉じる
- Firebase未設定時: 「デモモード」メッセージを表示し2.5秒後に閉じる

#### 支援申請モーダル

ID: `inquiry-modal`  
トリガー: クラブカードの「詳細・支援申請」ボタン → `openInquiryModal(orgId, orgName)` 関数  
モーダルタイトル下に支援先クラブ名を表示  
閉じる: ×ボタン / モーダル背景クリック / ESCキー

**フォーム項目一覧:**

| フィールド | 入力タイプ | 必須 | Firestoreフィールド |
|----------|----------|------|------------------|
| （hidden） | hidden | - | `org_id`（選択したクラブのDocumentID） |
| 企業名・団体名 | text | 必須 | `company_name` |
| ご担当者名 | text | 必須 | `pic_name` |
| メールアドレス | email | 必須 | `sender_email` |
| 電話番号 | tel | 任意 | `phone` |
| 支援内容・メッセージ | textarea | 必須 | `message`（4行） |

**送信処理:**
- `status: "new"` で Firestore `inquiries` コレクションに追加
- 成功時: 「申請を受け付けました」を表示し2.5秒後にモーダルを閉じる
- Firebase未設定時: デモモードメッセージ

---

### 4.2 管理ダッシュボード（admin.html）

#### ログイン画面・認証フロー（v1.4更新）

**認証ヘルパー `verifyAdminAndShow(user, errEl)`:**
- `user.getIdTokenResult(true)` で最新トークンを強制取得
- `claims.admin === true` なら `showDashboard(user)`
- それ以外なら `auth.signOut()` → `showLogin()` → errEl にエラー表示

**ページロード時（既存セッション確認）:**
- Promise ベース one-shot で `onAuthStateChanged` を一度だけ購読
- ユーザーなし → `showLogin()`
- ユーザーあり → `verifyAdminAndShow()` を呼び出し

**ログインフォーム送信:**
- `signInWithEmailAndPassword()` 成功後 → `verifyAdminAndShow()`
- 失敗時: エラーコードを日本語メッセージにマッピング
  - `auth/user-not-found`: メールアドレスが見つかりません
  - `auth/wrong-password`: パスワードが正しくありません
  - `auth/invalid-email`: メールアドレスの形式が正しくありません
  - `auth/too-many-requests`: ログイン試行が多すぎます

**ログアウト（`doSignOut()`）:**
- `auth.signOut()` → 明示的に `showLogin()` を呼び出す
- （Promise ベースで listener は解除済みのため onAuthStateChanged は使わない）

#### サイドバーナビ

固定幅 `w-60`（240px）、背景色: `#0f0e2e`  
上部: ロゴ  
ナビゲーションメニュー: 概要 / 審査待ち / 団体管理 / 支援申請 / お問い合わせ  
バッジ表示: 「審査待ち」にオレンジバッジ（件数）、「支援申請」にブルーバッジ（未対応件数）  
下部: ログイン中のメールアドレス / ログアウトボタン / 公開サイトへのリンク

#### 概要タブ（overview）

**統計カード 4項目:**

| カードID | 表示内容 | 取得クエリ |
|--------|---------|---------|
| `ov-pending` | 審査待ち団体数 | organizations where status=pending |
| `ov-public` | 公開中の団体数 | organizations where status=public |
| `ov-inquiries` | 新規支援申請数 | inquiries 全件取得 |
| `ov-contacts` | お問い合わせ件数 | contacts 全件取得 |

下部: 最近の審査待ち団体リスト（最新5件）。各行に承認ボタン・却下ボタンを表示。

#### 審査待ちタブ（pending）

- Firestore から `status=pending` の団体を `created_at` 降順で取得・表示
- 各団体カードに「承認・公開」ボタン（status → public）と「却下」ボタン（確認ダイアログ → status → rejected）

#### 団体管理タブ（orgs）

- 全ステータスの団体を `created_at` 降順で取得
- フィルターボタン: すべて / 公開中 / 審査中 / 却下済み
- 各カードの操作ボタン:
  - `pending` の場合: 「承認・公開」「却下」
  - `public` の場合: 「非公開」（status → pending）
  - 全ステータス共通: 「削除」ボタン（確認ダイアログ → Firestoreからドキュメント削除）

#### 支援申請タブ（inquiries）

- `inquiries` コレクションを `created_at` 降順で全件取得
- 各カードの表示: 企業名・ステータスバッジ・担当者名・メール・電話・日時・メッセージ内容
- 操作: 「対応済みにする」ボタン（status → done） / 「未対応に戻す」ボタン（status → new） / 「返信する」リンク（mailto:）

**ステータスバッジ定義:**
| status値 | ラベル | スタイル |
|---------|-------|---------|
| pending | 審査中 | bg-amber-100 text-amber-600 |
| public | 公開中 | bg-green-100 text-green-700 |
| rejected | 却下 | bg-red-100 text-red-600 |
| new | 未対応 | bg-blue-50 text-blue-600 |
| done | 対応済み | bg-green-50 text-green-600 |

#### お問い合わせタブ（contacts）

- `contacts` コレクションを `created_at` 降順で全件取得
- 各カードの表示: 名前・メールアドレス・日時・本文
- 「返信」リンク（mailto:）

---

### 4.3 クラブ詳細ページ（club.html）

**URL形式:** `club.html?id=ORG_ID`

**表示フロー:**
1. URLパラメータ `id` からORG_IDを取得
2. `organizations/{id}` を Firestore から取得
3. `status !== 'public'` または存在しない場合はエラー表示
4. `organizations/{id}/menus` サブコレクション（`status == 'public'` のみ）を取得
5. `posts` コレクション（`org_id == id`）を `created_at` 降順・limit 20 で取得
6. ページを描画

**ページセクション構成:**

| セクション | 要素 |
|----------|------|
| ナビゲーション | ロゴ・ナビリンク・認証状態切り替えヘッダー（index.htmlと同様） |
| ヒーロー | メイン画像（または深紺グラデーション背景）・クラブ名・カテゴリバッジ・エリア・ニーズタグ・「このクラブを応援する」ボタン（→ #support-menus へスクロール） |
| クラブ紹介 | `activity_how` の本文（改行・段落対応） |
| 支援メニュー（#support-menus） | menusカード一覧（support_type アイコン・title・target_amount・description・return_merit・「支援・問い合わせ」ボタン）。メニューなし時は「準備中」メッセージ |
| 活動日記 | postsカード一覧（画像・日付・title・content 3行クランプ）。投稿なし時は「準備中」メッセージ |
| CTAバナー | 支援申請モーダルを開くボタン（深紺背景） |
| フッター | 団体一覧リンク・ロゴ・コピーライト |

**エラー表示:**
- URLに `id` パラメータなし: 「URLにクラブIDが指定されていません」
- ドキュメント未存在: 「指定されたクラブは存在しません」
- `status !== 'public'`: 「このページは非公開です」

---

### 4.4 マイページ（mypage.html）

**認証制御:** `onAuthStateChanged` で未ログイン時は自動的に `index.html` へリダイレクト。

**レイアウト構成:**
- 左サイドバー（固定幅 `w-60`、背景 `#0f0e2e`）: ロゴ・3タブナビ・ユーザーメール・ログアウトボタン・公開ページリンク
- 右メインエリア: ヘッダー（ページタイトル・サブタイトル）+ コンテンツ

**3タブ構成:**

| タブ | ID | 内容 |
|-----|-----|-----|
| プロフィール | `tab-profile` | 団体情報編集フォーム・ステータスバナー表示 |
| 支援メニュー | `tab-menus` | menus サブコレクション CRUD |
| 活動日記 | `tab-diary` | posts コレクション CRUD |

**プロフィールタブ:**
- ステータスバナー: `pending`（審査中・黄）/ `public`（公開中・緑）/ `rejected`（却下・赤）
- 編集フィールド: 団体名 / カテゴリ / エリア / メイン画像URL / 支援ニーズタグ（カンマ区切り）/ 活動内容
- 保存: `db.collection('organizations').doc(id).update(data)`

**支援メニュータブ:**
- 一覧表示: title・support_type・target_amount・description・return_merit・公開状態バッジ
- 操作ボタン: 編集（フォームをスライド展開）/ 公開切り替え（toggle）/ 削除（確認ダイアログ）
- 追加/編集フォーム: `slide-down` アニメーションで表示
- Firestore操作: `organizations/{id}/menus` サブコレクション

**活動日記タブ:**
- 一覧表示: サムネイル画像・日時・title・content 2行クランプ
- 操作ボタン: 編集 / 削除（確認ダイアログ）
- 投稿フォーム: title・content（8行）・image_url
- Firestore操作: `posts` コレクション（org_id・owner_uid を自動付与）

**データ取得（初期化時）:**
```javascript
// owner_uid で自団体を検索
db.collection('organizations').where('owner_uid', '==', uid).limit(1).get()
```
自団体が存在しない場合は「団体が見つかりません」画面を表示。

**デモモード（Firebase未設定時）:**
- DEMO_ORG / DEMO_MENUS / DEMO_POSTS のサンプルデータを使用
- 保存・削除操作はローカル更新のみ

---

## 5. 機能仕様

### 5.1 団体登録フロー（申請→審査→公開）

```
[一般ユーザー]
  1. 公開サイトのクラブ登録ボタンをクリック
  2. 登録モーダルでフォーム入力（クラブ名・カテゴリ・地域・メール・紹介文 etc.）
  3. 「登録申請する」送信
  4. Firestore organizations に status=pending で保存

[管理者]
  5. admin.html の審査待ちタブで申請を確認
  6. 内容を審査
  7a. 承認 → status を public に更新 → 公開サイトに表示される
  7b. 却下 → status を rejected に更新 → 非公開のまま
```

### 5.2 支援申請フロー

```
[企業ユーザー]
  1. 公開サイトのクラブ一覧からクラブを選択
  2. 「詳細・支援申請」ボタンをクリック
  3. 支援申請モーダルでフォーム入力（企業名・担当者・メール・支援内容）
  4. 「申請する」送信
  5. Firestore inquiries に status=new で保存

[管理者]
  6. admin.html の支援申請タブで確認
  7. 「返信する」(mailto:) で企業担当者へメール
  8. 「対応済みにする」で status を done に更新
```

### 5.3 管理者承認フロー

```
管理者ログイン（Firebase Auth メール/パスワード）
  ↓
ダッシュボード表示
  ├─ 概要タブ: 審査待ち・公開中・支援申請・お問い合わせ件数の俯瞰
  ├─ 審査待ちタブ: pending → public / rejected の更新
  ├─ 団体管理タブ: 全団体の状態管理・削除
  ├─ 支援申請タブ: 企業への返信・対応ステータス管理
  └─ お問い合わせタブ: 一般問い合わせへの返信
```

### 5.4 Firebase未設定時のフォールバック（v1.3以降: デモデータ廃止）

| 機能 | Firebase設定済み | Firebase未設定 |
|-----|---------------|--------------|
| 団体一覧 | Firestoreから取得 | 空リスト表示（「該当するクラブはありません」） |
| 統計カウンター | Firestoreから取得 | `0` を表示 |
| 団体登録申請 | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| 支援申請 | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| お問い合わせ | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| マイページ | Firebase Auth認証後に表示 | no-org-screen を表示 |
| 管理ダッシュボード | Firebase Auth + Custom Claims認証後に表示 | 任意メール入力でデモ表示 |

> v1.3以前に存在したサンプルデータ（SAMPLE_ORGS / DEMO_ORG / DEMO_MENUS / DEMO_POSTS）は全て削除済み。

### 5.5 認証フロー

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
onAuthStateChanged → ヘッダーUI更新（guest非表示 / user表示）
  ↓
mypage.html へ遷移

【パスワードリセット】
メールアドレス入力
  ↓
Auth.sendPasswordResetEmail(email)
  ↓
メール受信 → リセットリンクをクリック → パスワード再設定

【ログアウト】
auth.signOut()
  ↓
index.html へ遷移（mypage.html は onAuthStateChanged でリダイレクト）
```

### 5.6 クラブ詳細ページ表示フロー

```
index.html クラブカード「詳細を見る」
  ↓
club.html?id=ORG_ID へ遷移
  ↓
URLパラメータ id を取得
  ↓
Firestore organizations/{id} を取得
  ├─ 存在しない / status != 'public' → エラー画面表示
  └─ status == 'public' → 以下を並列取得（Promise.all）
       ├─ organizations/{id}/menus（where status == 'public'）
       └─ posts（where org_id == id, orderBy created_at desc, limit 20）
  ↓
ページ全体を描画（hero / about / menus / posts / CTA / footer）
```

### 5.7 マイページ操作フロー

```
mypage.html アクセス
  ↓
onAuthStateChanged
  ├─ 未ログイン → index.html へリダイレクト
  └─ ログイン済み → uid で organizations 検索（where owner_uid == uid）
       ├─ 団体なし → 「団体が見つかりません」画面
       └─ 団体あり → ダッシュボード初期化（プロフィールタブ表示）

【プロフィール編集】
フォーム編集 → 「変更を保存」送信
  ↓
db.collection('organizations').doc(currentOrg.id).update(data)

【支援メニュー管理】
「新規メニューを追加」→ フォーム展開 → 保存
  ↓ 新規: menusRef.add(data) / 編集: menusRef.doc(id).update(data)
「公開切り替え」→ menusRef.doc(id).update({ status: newStatus })
「削除」→ 確認ダイアログ → menusRef.doc(id).delete()

【活動日記管理】
「新しい活動を投稿」→ フォーム展開 → 投稿
  ↓ 新規: db.collection('posts').add({ org_id, owner_uid, ...data })
  ↓ 編集: db.collection('posts').doc(id).update(data)
「削除」→ 確認ダイアログ → db.collection('posts').doc(id).delete()
```

---

## 6. セキュリティ設計

### 6.1 Firestoreルール（更新版：オーナー制御対応）

**設計方針:**
- 最小権限の原則を適用
- 一般ユーザーは `status=public` の団体情報・支援メニュー・投稿のみ読み取り可
- クラブオーナーは自分の団体データ・menus・postsを自由に操作可能
- inquiries・contacts は書き込みのみ許可（認証済みユーザーは読み取り可）
- `isOwnerOf(orgId)` 関数で Firestore 上のオーナー確認を実施

**アクセス制御マトリクス:**

| コレクション | 操作 | 許可条件 |
|------------|------|---------|
| organizations | get | `status == "public"` は全員 / 認証済みは全ステータス |
| organizations | list | 認証済みのみ |
| organizations | create | 認証済み + `owner_uid` == 自分 + `status == "pending"` |
| organizations | update / delete | 認証済み |
| organizations/menus | read | `status == "public"` は全員 / `isOwnerOf(orgId)` は全件 |
| organizations/menus | write | `isOwnerOf(orgId)` のみ |
| posts | read | 誰でも可（全公開） |
| posts | create | 認証済み + `owner_uid` == 自分 |
| posts | update / delete | 認証済み + `owner_uid` == 自分（自分の投稿のみ） |
| inquiries | create | 誰でも可 |
| inquiries | read / update / delete | 認証済みのみ |
| contacts | create | 誰でも可 |
| contacts | read / update / delete | 認証済みのみ |

### 6.2 認証設計（Firebase Auth）

- 認証方式: メール/パスワード認証
- 対象: 管理ダッシュボード（admin.html）+ クラブオーナー（index.html / mypage.html）
- 公開サイト（index.html）のクラブ閲覧・支援申請・お問い合わせは認証不要
- `onAuthStateChanged` によるセッション管理（全ページ）
- ログアウト: `auth.signOut()`
- mypage.html は未ログイン時に index.html へ自動リダイレクト

### 6.3 XSS対策（esc()関数）

全ファイル（index.html / admin.html / club.html / mypage.html）に共通の `esc()` 関数を実装。  
Firestoreから取得したデータを動的にHTMLへ埋め込む際、すべて `esc()` を通してエスケープ処理を行う。

**対象文字と変換:**
```javascript
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])
  );
}
```

### 6.4 セキュリティヘッダー（netlify.toml）

全ページ（`/*`）に以下のHTTPレスポンスヘッダーを付与:

| ヘッダー名 | 値 | 効果 |
|----------|-----|-----|
| `X-Frame-Options` | `DENY` | クリックジャッキング防止（iframeへの埋め込み全禁止） |
| `X-Content-Type-Options` | `nosniff` | MIMEスニッフィング攻撃の防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー情報の漏洩を制限 |

---

## 7. インフラ・デプロイ

### 7.1 ホスティング（Netlify）

**netlify.toml の設定内容:**

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

- ビルドディレクトリ: リポジトリルート（`.`）
- リダイレクト設定: 全パスを `/index.html` にリダイレクト（SPAモード、ステータス 200）
- admin.html は直接アクセス可能（Netlifyの静的ファイルとして配信）

### 7.2 データベース（Firebase Firestore）

| 項目 | 設定値 |
|-----|-------|
| プロジェクトID | `sasaeru-7f375` |
| リージョン | asia-northeast1（東京） |
| モード | Native モード |
| SDK | Firebase v10.12.2 compat |

**Firestoreインデックス（`firestore.indexes.json` にて管理・デプロイ済み）:**

| コレクション | フィールド1 | フィールド2 | 状態 | 用途 |
|------------|----------|----------|------|-----|
| posts | org_id ASC | created_at DESC | ✅ デプロイ済み | マイページ活動日記一覧取得 |

> `firebase deploy --only firestore:indexes` でデプロイ管理。

### 7.3 認証（Firebase Auth）

| 項目 | 設定値 |
|-----|-------|
| プロジェクト | sasaeru-7f375 |
| authDomain | sasaeru-7f375.firebaseapp.com |
| 認証方式 | メール/パスワード |
| 対象 | 管理者アカウントのみ |

### 7.4 デプロイフロー

**フロントエンド（Netlify 自動デプロイ）:**
```
開発者のローカル環境
    ↓ git push (main ブランチ)
GitHub リポジトリ
    ↓ Netlify CI/CD 自動検知
Netlify ビルド（publish="." のためビルド不要）
    ↓ 即時（数十秒以内）
本番環境（Netlify CDN）で公開
```

**Firestore ルール・インデックス（Firebase CLI 手動デプロイ）:**
```bash
# ルールのみ更新
firebase deploy --only firestore:rules

# インデックスのみ更新
firebase deploy --only firestore:indexes

# 両方まとめて
firebase deploy --only firestore
```

> Firestoreルール・インデックスは git push では自動デプロイされない。変更時は必ず Firebase CLI でデプロイすること。

---

## 8. 運用・保守

### 8.1 管理者アカウント管理

**手順:**
1. Firebase Console（Authentication）でメール/パスワードアカウントを作成
2. Firebase Admin SDK で Custom Claims を付与（**必須**）:
   ```javascript
   // Node.js スクリプト（set-admin.js）
   const admin = require('firebase-admin');
   const serviceAccount = require('./serviceAccountKey.json');
   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
   await admin.auth().setCustomUserClaims('管理者のUID', { admin: true });
   ```
3. 管理者が一度ログアウト → 再ログインしてトークンを更新（`admin.html` は `getIdTokenResult(true)` で強制リフレッシュするため即反映）

**権限剥奪:**
```javascript
await admin.auth().setCustomUserClaims('対象UID', {});
```

**注意:** サービスアカウントキー（`serviceAccountKey.json`）は `.gitignore` で管理し、リポジトリにコミットしないこと。

### 8.2 団体審査フロー

1. admin.html にアクセス（`/admin.html`）
2. 管理者アカウントでログイン
3. 「審査待ち」タブを確認（バッジに件数表示）
4. 各団体の情報（クラブ名・カテゴリ・地域・メール・紹介文・ニーズタグ）を確認
5. 承認する場合: 「承認・公開」ボタンをクリック → 即時公開
6. 却下する場合: 「却下」ボタンをクリック → 確認ダイアログで「却下する」を選択
7. 必要に応じて申請者の `contact_email` に直接メールで結果を通知（システム自動通知なし）

### 8.3 Firestoreインデックス管理

インデックスは `firestore.indexes.json` で管理し、`firebase deploy --only firestore:indexes` でデプロイする。

**現在のデプロイ済みインデックス:**

| コレクション | フィールド1 | フィールド2 | 用途 |
|------------|----------|----------|-----|
| posts | org_id ASC | created_at DESC | マイページ活動日記一覧（`where org_id + orderBy created_at`） |

**インデックス追加が必要になった場合:**
1. `firestore.indexes.json` に定義を追加
2. `firebase deploy --only firestore:indexes` を実行
3. Firebase Console で「有効」になるまで待つ（通常2〜5分）

> admin.html での `organizations` / `inquiries` / `contacts` の `orderBy` クエリはクライアント側ソートに変更済みのため追加インデックス不要。

### 8.4 Phase 2 拡張計画

| 機能 | 概要 | 技術的変更点 |
|-----|------|------------|
| クラブ詳細ページ | 各クラブの専用ページ（URL: `/clubs/:id`） | SPAルーティング実装またはHTMLページ追加 |
| 直接メッセージ | クラブと企業間のメッセージ機能 | Firestoreに `messages` コレクション追加 |
| 支援実績表示 | マッチング成立件数・金額の表示 | Firestoreにフィールド追加 |
| 地域別絞り込み | 市区町村での検索 | Firestoreの複合クエリ拡張 |
| 画像アップロード | URL入力ではなくファイルアップロード | Firebase Storage 追加 |
| 通知メール | 申請受付・審査完了の自動通知 | Firebase Functions + SendGrid/Resend |
| 多言語対応 | 日本語以外の言語対応 | i18n ライブラリ導入 |

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

*本仕様書はG-Stack AIチームのSpec Writerエージェントにより自動生成されました。*  
*生成日: 2026-04-16*
