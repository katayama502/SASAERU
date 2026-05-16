// ============================================================
// SASAERU 設定テンプレート
// config.js にコピーして実際の値を入力してください。
// ※ config.js は .gitignore に含まれており、リポジトリには含まれません。
//    Netlify の「Snippet Injection」機能で window.SASAERU_CONFIG を注入してください。
// ============================================================
window.SASAERU_CONFIG = {
  // Cloudinary（画像アップロード）
  // https://cloudinary.com でアカウント作成後に設定
  cloudinaryCloudName: '',
  cloudinaryPreset:    '',

  // Slack 通知（空欄で無効）
  // https://api.slack.com/messaging/webhooks で取得
  slackWebhook: '',
};
