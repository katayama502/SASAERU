# SASAERU システム仕様書

**バージョン:** 1.0  
**作成日:** 2026-04-16  
**作成者:** G-Stack AI チーム / Spec Writer  
**ステータス:** 確定版

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
| 認証 | Firebase Auth | v10.12.2 compat SDK（管理画面のみ） |
| ホスティング | Netlify | 静的サイト配信 |
| バックエンド | なし（フルサーバーレス） | - |

### 2.3 ファイル構成一覧

```
SASAERU/
├── index.html          # 公開サイト（メインページ）
├── admin.html          # 管理ダッシュボード
├── firestore.rules     # Firestore セキュリティルール
├── netlify.toml        # Netlify 設定（リダイレクト・ヘッダー）
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

### 3.4 セキュリティルール説明

ファイル: `firestore.rules`

| コレクション | 操作 | 許可条件 |
|------------|------|---------|
| organizations | get（1件取得） | `status == "public"` の場合は誰でも可。管理者（認証済み）は全ステータス可 |
| organizations | list（一覧取得） | 管理者のみ |
| organizations | create（新規作成） | `status == "pending"` でのみ誰でも作成可（公開直接投稿を防止） |
| organizations | update（更新） | 管理者のみ |
| organizations | delete（削除） | 管理者のみ |
| inquiries | create | 誰でも可（企業・匿名ユーザーが支援申請できる） |
| inquiries | read / update / delete | 管理者のみ |
| contacts | create | 誰でも可 |
| contacts | read / update / delete | 管理者のみ |

**`isAdmin()` 関数定義:**
```javascript
function isAdmin() {
  return request.auth != null;
}
```
Firebase Auth でサインイン済みのユーザーを管理者と判定する。

---

## 4. 画面仕様

### 4.1 公開サイト（index.html）

#### ナビゲーション

- ロゴ（SASAERUロゴ + ハートアイコン）
- デスクトップナビリンク: SASAERUとは / クラブを探す / 企業の方へ / お問い合わせ
- 「クラブ登録（無料）」ボタン → クラブ登録モーダルを開く
- モバイル: ハンバーガーメニュー（トグル開閉、ESCキーにも非対応・×ボタンで閉じる）
- 背景色: `#0f0e2e`（深紺）、sticky固定 z-index: 50

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

#### ログイン画面

- Firebase Auth メール/パスワード認証
- Firebase未設定時: 任意のメールを入力するとデモモードでダッシュボードが表示される
- エラーメッセージ対応:
  - `auth/user-not-found`: メールアドレスが見つかりません
  - `auth/wrong-password`: パスワードが正しくありません
  - `auth/invalid-email`: メールアドレスの形式が正しくありません
  - `auth/too-many-requests`: ログイン試行が多すぎます

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

### 5.4 Firebase未設定時のフォールバック（デモモード）

| 機能 | Firebase設定済み | Firebase未設定（デモモード） |
|-----|---------------|--------------------------|
| 団体一覧 | Firestoreから取得 | サンプルデータ3件を表示 |
| 統計カウンター | Firestoreから取得 | サンプル件数をカウントアニメーション |
| 団体登録申請 | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| 支援申請 | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| お問い合わせ | Firestoreへ保存 | 「デモモード」メッセージを表示 |
| 管理ダッシュボード | Firebase Auth認証後に表示 | 任意メール入力でデモ表示 |

**サンプルデータ（3件）:**
1. 青空ジュニアサッカークラブ（スポーツ / 島根県松江市）
2. ふるさと伝統芸能保存会（文化・芸術 / 島根県出雲市）
3. わんぱく野球団（スポーツ / 島根県浜田市）

---

## 6. セキュリティ設計

### 6.1 Firestoreルール（役割ベースアクセス制御）

**設計方針:**
- 最小権限の原則を適用
- 一般ユーザーは読み取り可能なデータを `status=public` の団体情報のみに限定
- inquiriesとcontactsは書き込みのみ許可（送信後の閲覧不可）
- 管理者（Firebase Auth認証済み）のみ全データへのアクセスを許可

**ルール概要:**
```
organizations:
  - get: status="public" は誰でも可 / 管理者は全件可
  - list: 管理者のみ
  - create: status="pending" のみ誰でも可（直接公開の防止）
  - update/delete: 管理者のみ

inquiries / contacts:
  - create: 誰でも可（匿名送信を許可）
  - read/update/delete: 管理者のみ
```

### 6.2 認証設計（Firebase Auth）

- 認証方式: メール/パスワード認証
- 対象: 管理ダッシュボード（admin.html）のみ
- 公開サイト（index.html）は認証不要
- `onAuthStateChanged` によるセッション管理
- ログアウト: `auth.signOut()`

### 6.3 XSS対策（esc()関数）

両ファイル（index.html / admin.html）に共通の `esc()` 関数を実装。  
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

**Firestoreインデックス（推奨設定）:**
```
コレクション: organizations
  - status ASC, created_at DESC（公開一覧取得に使用）
  - status ASC（管理者フィルタリングに使用）

コレクション: inquiries
  - created_at DESC（支援申請一覧取得に使用）
  - status ASC（未対応フィルタリングに使用）
```

### 7.3 認証（Firebase Auth）

| 項目 | 設定値 |
|-----|-------|
| プロジェクト | sasaeru-7f375 |
| authDomain | sasaeru-7f375.firebaseapp.com |
| 認証方式 | メール/パスワード |
| 対象 | 管理者アカウントのみ |

### 7.4 デプロイフロー

```
開発者のローカル環境
    ↓ git push (main ブランチ)
GitHub リポジトリ
    ↓ Netlify CI/CD 自動検知
Netlify ビルド（publish="." のためビルド不要）
    ↓ 即時
本番環境（Netlify CDN）で公開
```

- ビルドコマンド: なし（静的ファイルのため不要）
- ビルド所要時間: ほぼ即時（数十秒以内）

---

## 8. 運用・保守

### 8.1 管理者アカウント管理

- Firebase Console（Authentication）からメール/パスワードアカウントを作成
- 管理者権限の付与はFirebase Auth への登録のみで完結（Firestoreルールで `auth != null` を管理者と判定）
- パスワードリセットはFirebase Consoleまたは Firebase Auth API経由

### 8.2 団体審査フロー

1. admin.html にアクセス（`/admin.html`）
2. 管理者アカウントでログイン
3. 「審査待ち」タブを確認（バッジに件数表示）
4. 各団体の情報（クラブ名・カテゴリ・地域・メール・紹介文・ニーズタグ）を確認
5. 承認する場合: 「承認・公開」ボタンをクリック → 即時公開
6. 却下する場合: 「却下」ボタンをクリック → 確認ダイアログで「却下する」を選択
7. 必要に応じて申請者の `contact_email` に直接メールで結果を通知（システム自動通知なし）

### 8.3 Firestoreインデックス設定

以下のクエリを使用しているため、複合インデックスが必要な場合はFirebase Consoleで設定:

| コレクション | フィールド1 | フィールド2 | 用途 |
|------------|----------|----------|-----|
| organizations | status (==) | created_at (desc) | 公開クラブ一覧取得 |
| organizations | status (==) | created_at (desc) | 審査待ち一覧取得 |
| inquiries | created_at (desc) | - | 支援申請一覧取得 |
| contacts | created_at (desc) | - | お問い合わせ一覧取得 |

初回クエリ実行時にFirebaseエラーコンソールにインデックス作成リンクが表示されるため、そちらからワンクリックで作成可能。

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
