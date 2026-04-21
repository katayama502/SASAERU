# SASAERU 運用手順書
## デプロイ・通知設定・外部サービス設定ガイド

**対象者:** 初学者・引継ぎ担当者  
**作成日:** 2026-04-21  
**バージョン:** v1.0

---

## 目次

1. [全体の構成図](#1-全体の構成図)
2. [前提条件・アカウント一覧](#2-前提条件アカウント一覧)
3. [Cloudinary 設定（画像アップロード）](#3-cloudinary-設定画像アップロード)
4. [EmailJS 設定（メール通知）](#4-emailjs-設定メール通知)
5. [Slack 設定（Slack通知）](#5-slack-設定slack通知)
6. [Netlify デプロイ手順](#6-netlify-デプロイ手順)
7. [Netlify Snippet Injection（本番環境への設定注入）](#7-netlify-snippet-injection本番環境への設定注入)
8. [設定変更・更新の手順](#8-設定変更更新の手順)
9. [よくあるトラブルと対処法](#9-よくあるトラブルと対処法)

---

## 1. 全体の構成図

```
ユーザーのブラウザ
    │
    ├─ index.html / club.html / mypage.html / admin.html
    │       │
    │       ├─ Firebase（ユーザー認証・データベース）
    │       ├─ Cloudinary（画像アップロード・保存）
    │       ├─ EmailJS（メール通知送信）
    │       └─ Slack Webhook（Slack通知送信）
    │
    └─ Netlify（ホスティング・公開）
            │
            └─ GitHub（ソースコード管理・自動デプロイ）
```

**各サービスの役割:**

| サービス | 役割 | 料金 |
|---------|------|------|
| Firebase | ログイン・データ保存 | 無料（Sparkプラン） |
| Cloudinary | 画像のアップロード・保存 | 無料（月25GB） |
| EmailJS | 管理者へのメール通知 | 無料（月200通） |
| Slack | 管理者へのSlack通知 | 無料 |
| Netlify | サイトの公開・ホスティング | 無料（Starterプラン） |
| GitHub | ソースコード管理 | 無料 |

---

## 2. 前提条件・アカウント一覧

以下のアカウントがすでに作成済みであることを確認してください。

- [ ] GitHub アカウント（リポジトリ: `katayama502/SASAERU`）
- [ ] Firebase アカウント（プロジェクト: `sasaeru-7f375`）
- [ ] Cloudinary アカウント
- [ ] EmailJS アカウント
- [ ] Netlify アカウント
- [ ] Slack ワークスペース（通知を受け取る場所）

---

## 3. Cloudinary 設定（画像アップロード）

Cloudinaryはクラブの画像をアップロード・保存するサービスです。

### 3-1. アカウント作成

1. [https://cloudinary.com](https://cloudinary.com) を開く
2. 右上の **「Sign Up For Free」** をクリック
3. メールアドレス・パスワードを入力して登録
4. 確認メールが届いたらリンクをクリックして認証

### 3-2. Cloud Name を確認する

1. ログイン後、ダッシュボードのトップ画面を開く
2. 左上に表示されている **「Cloud Name」** をメモする
   ```
   例: dzfcj3rvc
   ```

### 3-3. Upload Preset を作成する

1. 左メニューから **「Settings（歯車アイコン）」** をクリック
2. 上部タブの **「Upload」** をクリック
3. 「Upload presets」セクションまでスクロール
4. **「Add upload preset」** をクリック
5. 以下のように設定する：
   - **Preset name:** `SASAERU`（任意の名前）
   - **Signing Mode:** `Unsigned` ← **ここが重要！**
6. ページ上部の **「Save」** をクリック

> ⚠️ **注意:** Signing Mode が `Signed` のままだと画像アップロードが失敗します。必ず `Unsigned` に設定してください。

---

## 4. EmailJS 設定（メール通知）

クラブ申請・支援申請・お問い合わせがあったとき、管理者のメールアドレスに通知を送ります。

### 4-1. アカウント作成

1. [https://www.emailjs.com](https://www.emailjs.com) を開く
2. **「Sign Up Free」** をクリック
3. メールアドレス・パスワードで登録してログイン

### 4-2. Email Service を追加（送信元メール設定）

1. 左メニュー **「Email Services」** をクリック
2. **「Add New Service」** をクリック
3. **「Gmail」** を選択（Gmailが最も簡単）
4. **「Connect Account」** をクリック
5. 通知を受け取りたいGoogleアカウントでログインして許可
6. **「Create Service」** をクリック
7. 画面に表示される **Service ID** をメモする
   ```
   例: service_sddzr7a
   ```

### 4-3. Email Template を作成（通知メールの文面）

1. 左メニュー **「Email Templates」** をクリック
2. **「Create New Template」** をクリック
3. 以下のように設定する：

**To Email（宛先）:**
```
あなたの管理者メールアドレスを入力
例: admin@example.com
```

**Subject（件名）:**
```
[SASAERU] {{notification_type}}
```

**Content（本文）の入力欄に以下を貼り付け:**
```
{{notification_type}} がありました。

【内容】
{{message}}

---
管理画面で確認してください。
https://あなたのサイトURL/admin.html
```

4. 右上 **「Save」** をクリック
5. URLバーを確認し、`/templates/` の後ろの文字列が **Template ID**
   ```
   例: template_jot6ake
   ```

### 4-4. Public Key を確認する

1. 右上のアカウントアイコンをクリック → **「Account」**
2. 「API Keys」セクションの **「Public Key」** をコピー
   ```
   例: V50wijLKFvClfEkmy
   ```

> 💡 **メモ:** Public Key はフロントエンドのコードに書いても問題ありません（EmailJSの仕様上、公開して良いキーです）

---

## 5. Slack 設定（Slack通知）

クラブ申請・支援申請・お問い合わせがあったとき、指定したSlackチャンネルに通知を送ります。

### 5-1. Slack App を作成する

1. [https://api.slack.com/apps](https://api.slack.com/apps) を開く
   （Slackにログインしている状態で開くこと）
2. 右上の **「Create New App」** をクリック
3. **「From an app manifest」** を選択
4. 通知を送りたいワークスペースを選択 → **「Next」**
5. **「YAML」タブ**が選択されていることを確認
6. 表示されているテキストを全て削除し、以下を貼り付ける：

```yaml
display_information:
  name: SASAERU通知
features:
  bot_user:
    display_name: SASAERU通知
    always_online: false
oauth_config:
  scopes:
    bot:
      - chat:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

7. **「Next」** をクリック
8. 内容を確認して **「Create」** をクリック

### 5-2. ワークスペースにインストールする

1. 作成直後の画面で **「Install to Workspace」** をクリック
2. 確認画面で **「許可する」** をクリック

### 5-3. Webhook URL を取得する

1. 左メニュー **「Incoming Webhooks」** をクリック
2. ページ上部のトグルを **「On」** に切り替える
3. ページ下部の **「Add New Webhook to Workspace」** をクリック
4. 通知を受け取りたいチャンネルを選択（例: `#general` または新しく `#sasaeru通知` を作成）
5. **「許可する」** をクリック
6. 画面に表示された URL をコピーする
   ```
   例: https://hooks.slack.com/services/T0000XXXXX/B0000XXXXX/XXXXXXXXXXXXXXXXXXXX
   ```

> ⚠️ **注意:** この URL は秘密情報です。GitHubなどに公開しないようにしてください。

---

## 6. Netlify デプロイ手順

### 6-1. Netlify アカウント作成（初回のみ）

1. [https://netlify.com](https://netlify.com) を開く
2. **「Sign up」** をクリック
3. **「GitHub でサインアップ」** を選択（GitHubアカウントと連携するのが便利）

### 6-2. 新しいサイトを作成する（初回のみ）

1. Netlifyダッシュボードで **「Add new site」** → **「Import an existing project」** をクリック
2. **「Deploy with GitHub」** をクリック
3. GitHubの認証画面が開いたら許可する
4. リポジトリ一覧から **「SASAERU」** を選択
5. 以下の設定を確認する：
   - **Branch to deploy:** `main`
   - **Build command:** （空欄のまま）
   - **Publish directory:** `.`（ドット1つ）
6. **「Deploy SASAERU」** をクリック

> ✅ 数分後にデプロイが完了し、`https://xxxxxx.netlify.app` のようなURLが発行されます。

### 6-3. 独自ドメインを設定する（任意）

1. サイト設定 → **「Domain management」**
2. **「Add custom domain」** をクリック
3. お持ちのドメインを入力して設定する

### 6-4. 以降のデプロイ（自動）

GitHubの `main` ブランチにプッシュするたびに **自動で本番サイトが更新**されます。

```
ローカルで編集 → git push → Netlify が自動デプロイ
```

---

## 7. Netlify Snippet Injection（本番環境への設定注入）

`config.js` はGitにコミットしないため、Netlifyの「Snippet Injection」機能を使って本番環境に設定を注入します。

> 💡 **なぜこの手順が必要か？**  
> Slack Webhook URLなどの秘密情報をGitHubに公開しないために、コードから設定を分離しています。Netlifyのこの機能を使うことで、デプロイ時に自動で設定が埋め込まれます。

### 7-1. Snippet Injection を開く

1. Netlify ダッシュボードでサイトを選択
2. 上部メニュー **「Site configuration」** をクリック
3. 左メニュー **「Build & deploy」** → **「Post processing」** をクリック
4. **「Snippet injection」** セクションを探す
5. **「Add snippet」** をクリック

### 7-2. 設定を入力する

1. **「Where to inject」（注入位置）:** `before </head>` を選択
   > ⚠️ `before </body>` ではなく必ず **`before </head>`** を選択してください

2. **「Script name」（スクリプト名）:** `SASAERU Config`（管理用の名前。何でも可）

3. **「HTML to inject」（注入するコード）:** 以下を貼り付け、各値を実際の値に書き換える

```html
<script>
window.SASAERU_CONFIG = {
  cloudinaryCloudName: 'あなたのCloudinary Cloud Name',
  cloudinaryPreset: 'あなたのUpload Preset名',
  slackWebhook: 'https://hooks.slack.com/services/あなたのWebhook URL',
  emailjsPublicKey: 'あなたのEmailJS Public Key',
  emailjsServiceId: 'あなたのEmailJS Service ID',
  emailjsTemplateId: 'あなたのEmailJS Template ID'
};
</script>
```

**記入例:**
```html
<script>
window.SASAERU_CONFIG = {
  cloudinaryCloudName: 'dzfcj3rvc',
  cloudinaryPreset: 'SASAERU',
  slackWebhook: 'https://hooks.slack.com/services/T09PV2HMWJ1/B0AUL3R0VG9/xxxx',
  emailjsPublicKey: 'V50wijLKFvClfEkmy',
  emailjsServiceId: 'service_sddzr7a',
  emailjsTemplateId: 'template_jot6ake'
};
</script>
```

4. **「Save」** をクリック

### 7-3. 再デプロイして反映する

1. Netlify ダッシュボード → **「Deploys」** タブをクリック
2. **「Trigger deploy」** → **「Deploy site」** をクリック
3. デプロイ完了後、本番サイトで通知・Cloudinaryが動作するか確認する

---

## 8. 設定変更・更新の手順

### Webhook URL や EmailJS の設定を変更したい場合

1. Netlify → Site configuration → Post processing → Snippet injection
2. **「SASAERU Config」** の右側 **「Edit」** をクリック
3. 該当の値を書き換えて **「Save」**
4. **「Deploys」** → **「Trigger deploy」** → **「Deploy site」** で再デプロイ

### サイトのコード（HTML）を更新したい場合

ローカルで編集して `git push` するだけで自動デプロイされます：

```bash
# 変更後
git add -A
git commit -m "変更内容のメモ"
git push origin main
# → Netlify が自動でデプロイ開始
```

---

## 9. よくあるトラブルと対処法

### ❌ 画像がアップロードできない

**原因と対処:**
- Cloudinaryの Upload Preset が `Signed` になっている → `Unsigned` に変更する（[3-3参照](#3-3-upload-preset-を作成する)）
- Cloud Name や Preset 名が間違っている → Snippetの設定を確認する

---

### ❌ Slack/メール通知が届かない

**確認ポイント:**

1. **Netlify Snippet の注入位置が `before </head>` になっているか確認**
   - `before </body>` だと設定が読み込まれないため通知が動作しません

2. **Snippet の値にプレースホルダーが残っていないか確認**
   - `'https://hooks.slack.com/services/...'` のように `...` が残っていると動きません

3. **再デプロイしたか確認**
   - Snippet を保存しただけでは反映されません。「Trigger deploy」が必要です

4. **ブラウザのコンソールにエラーが出ていないか確認**
   - F12キー → Consoleタブ → `Slack通知失敗` や `Email通知失敗` のメッセージがないか確認

---

### ❌ GitHub プッシュが「secret detected」でブロックされる

**原因と対処:**
- Slack Webhook URL などの秘密情報がコードに直接書かれている
- `index.html` または `club.html` の `NOTIFY_SLACK_WEBHOOK` などの変数に実際の値が書かれていないか確認
- コードには値を書かず、必ず **Netlify Snippet Injection** で設定すること

---

### ❌ ログインできない / マイページに遷移しない

**確認ポイント:**
- メールアドレス・パスワードが正しいか確認
- Firebase Console でユーザーが作成されているか確認
  - Firebase Console → Authentication → Users

---

### ❌ 管理者でログインしてもマイページに遷移してしまう

**原因と対処:**
- Firebase の Custom Claims が設定されていない
- Firebase Admin SDK または Cloud Functions で `admin: true` のカスタムクレームを設定する必要があります
- Firebase Console でユーザーの UID を確認し、Cloud Shell から設定してください

---

## 各サービスの管理画面URL一覧

| サービス | 管理画面URL |
|---------|-----------|
| Firebase | https://console.firebase.google.com/project/sasaeru-7f375 |
| Cloudinary | https://console.cloudinary.com |
| EmailJS | https://dashboard.emailjs.com |
| Slack API | https://api.slack.com/apps |
| Netlify | https://app.netlify.com |
| GitHub | https://github.com/katayama502/SASAERU |

---

## 設定値一覧（引継ぎ用）

> ⚠️ **このファイルはGitにコミットされます。実際のキー・URLは記載せず、別途安全な場所に保管してください。**

| 項目 | 保存場所 |
|------|---------|
| Cloudinary Cloud Name | Cloudinaryダッシュボード |
| Cloudinary Upload Preset | Cloudinary → Settings → Upload |
| Slack Webhook URL | Slack API → App → Incoming Webhooks |
| EmailJS Public Key | EmailJS → Account → API Keys |
| EmailJS Service ID | EmailJS → Email Services |
| EmailJS Template ID | EmailJS → Email Templates |
| Firebase API Key | Firebase Console → プロジェクト設定 |

---

*作成: G-Stack AI / 2026-04-21 / v1.0*
