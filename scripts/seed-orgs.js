const admin = require('firebase-admin');
const path = require('path');

// サービスアカウントキーはプロジェクト外（~/.secrets/sasaeru/）に保管する。
// GOOGLE_APPLICATION_CREDENTIALS 環境変数があればそちらを優先。
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(require('os').homedir(), '.secrets/sasaeru/serviceAccountKey.json');
const serviceAccount = require(credentialsPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const now = admin.firestore.Timestamp.now();

const orgs = [
  // ── スポーツ（3件） ──────────────────────────────────────────
  {
    name: 'FC 東京フットボールクラブ',
    category: 'sports',
    area: '東京都世田谷区',
    contact_email: 'fc.tokyo.fb@example.com',
    main_image: null,
    tags: ['サッカー', '社会人', '週末活動'],
    activity_how: '毎週土曜に世田谷区の公営グラウンドで練習を行っています。年齢・経験不問で参加歓迎。リーグ戦への参加も積極的に行っており、地域の子どもたちへのサッカー教室も定期開催しています。',
    status: 'public',
    owner_uid: 'seed_user_001',
    emailVerified: true,
    created_at: now,
  },
  {
    name: 'みんなのランニング部 横浜',
    category: 'sports',
    area: '神奈川県横浜市',
    contact_email: 'running.yokohama@example.com',
    main_image: null,
    tags: ['ランニング', '健康', 'マラソン', '初心者歓迎'],
    activity_how: '横浜市内の公園や海沿いを拠点に週2〜3回のランニング練習を実施。フルマラソン完走を目指す初心者から、サブ3を狙う上級者まで一緒に楽しく走れる環境です。大会への参加サポートも行っています。',
    status: 'public',
    owner_uid: 'seed_user_002',
    emailVerified: true,
    created_at: now,
  },
  {
    name: '少年剣道クラブ 鶴岡竹刀会',
    category: 'sports',
    area: '山形県鶴岡市',
    contact_email: 'shinai.tsuruoka@example.com',
    main_image: null,
    tags: ['剣道', '子ども', '武道', '礼儀'],
    activity_how: '小学生・中学生を対象とした剣道クラブです。礼儀・礼節を大切にしながら、基礎から丁寧に指導します。地区大会への出場実績もあり、段位取得を目指す子どもたちを全力でサポートしています。',
    status: 'pending',
    owner_uid: 'seed_user_003',
    emailVerified: false,
    created_at: now,
  },

  // ── 文化・芸術（3件） ──────────────────────────────────────
  {
    name: '劇団 舞台の星 大阪',
    category: 'culture',
    area: '大阪府大阪市中央区',
    contact_email: 'butai.hoshi.osaka@example.com',
    main_image: null,
    tags: ['演劇', '舞台', 'アマチュア', '公演'],
    activity_how: '年2回の本公演を中心に、ワークショップや朗読会なども定期開催。社会人が多く、仕事帰りの夜間稽古が主です。演技未経験者でも脚本・舞台美術・照明など裏方から参加できます。観客動員数は年間800名を超えています。',
    status: 'public',
    owner_uid: 'seed_user_004',
    emailVerified: true,
    created_at: now,
  },
  {
    name: '写真愛好会 光と影',
    category: 'culture',
    area: '京都府京都市',
    contact_email: 'photo.hikari.kyoto@example.com',
    main_image: null,
    tags: ['写真', '撮影会', '展示', '風景'],
    activity_how: '京都の四季折々の風景や祭りを撮影する写真愛好会です。月1回の撮影会と年1回の写真展を実施。スマートフォンから一眼レフまで機材不問で参加できます。SNSでの発信支援や、フォトブック制作なども行っています。',
    status: 'public',
    owner_uid: 'seed_user_005',
    emailVerified: true,
    created_at: now,
  },
  {
    name: 'アコースティック音楽同好会 名古屋',
    category: 'culture',
    area: '愛知県名古屋市',
    contact_email: 'acoustic.nagoya@example.com',
    main_image: null,
    tags: ['ギター', '音楽', 'アコースティック', 'ライブ'],
    activity_how: 'ギター・ウクレレ・カホンなどのアコースティック楽器を中心とした音楽同好会。月2回の合奏練習と、年4回の街中カフェでのミニライブを実施しています。楽器初心者向けの無料体験会も定期開催中。',
    status: 'pending',
    owner_uid: 'seed_user_006',
    emailVerified: true,
    created_at: now,
  },

  // ── 福祉（2件） ────────────────────────────────────────────
  {
    name: '高齢者支援ボランティア 笑顔の輪',
    category: 'welfare',
    area: '埼玉県さいたま市',
    contact_email: 'egao.saitama@example.com',
    main_image: null,
    tags: ['高齢者', 'ボランティア', '見守り', '食事支援'],
    activity_how: '独居高齢者への定期訪問・見守り活動と、地域の集会所での食事会を月3回開催しています。買い物代行や通院同行のサポートも行っており、地域包括支援センターと連携しながら活動中。ボランティア登録者は現在120名。',
    status: 'public',
    owner_uid: 'seed_user_007',
    emailVerified: true,
    created_at: now,
  },
  {
    name: '子育て支援グループ ひだまり',
    category: 'welfare',
    area: '福岡県福岡市博多区',
    contact_email: 'hidamari.fukuoka@example.com',
    main_image: null,
    tags: ['子育て', '親子', '育児支援', '交流'],
    activity_how: '未就学児を持つ保護者が気軽に集える場所を提供する子育て支援グループ。毎週水曜・金曜に公民館で親子交流の場を開催し、育児相談・情報交換・おもちゃの貸し出しなどを行っています。年間延べ2,000名以上が利用。',
    status: 'public',
    owner_uid: 'seed_user_008',
    emailVerified: true,
    created_at: now,
  },

  // ── その他（2件） ──────────────────────────────────────────
  {
    name: '地域農業応援隊 みどりの手',
    category: 'other',
    area: '長野県松本市',
    contact_email: 'midori.matsumoto@example.com',
    main_image: null,
    tags: ['農業', '援農', '有機栽培', '地産地消'],
    activity_how: '高齢農家の農作業を週末に支援する援農ボランティアとして活動。農家さんから直接栽培技術を学びながら、有機野菜の収穫・出荷作業を手伝います。収穫祭や野菜の直売イベントも年2回開催しており、都市と農村をつなぐ活動を続けています。',
    status: 'public',
    owner_uid: 'seed_user_009',
    emailVerified: true,
    created_at: now,
  },
  {
    name: 'まちづくり推進クラブ 仙台',
    category: 'other',
    area: '宮城県仙台市',
    contact_email: 'machizukuri.sendai@example.com',
    main_image: null,
    tags: ['まちづくり', '地域活性化', 'イベント', '商店街'],
    activity_how: '仙台市内の商店街や公共スペースを活用した地域活性化イベントを企画・運営するクラブ。空き店舗のポップアップショップ企画、地域マップ作成、清掃・美化活動などを通じて住みやすい街づくりに取り組んでいます。',
    status: 'pending',
    owner_uid: 'seed_user_010',
    emailVerified: false,
    created_at: now,
  },
];

async function seed() {
  console.log(`${orgs.length} 件のテスト団体を Firestore に追加します...\n`);
  const batch = db.batch();
  for (const org of orgs) {
    const ref = db.collection('organizations').doc();
    batch.set(ref, org);
    console.log(`  [${org.status}] ${org.name}  (${org.category})`);
  }
  await batch.commit();
  console.log('\n✓ 全件追加完了');
  process.exit(0);
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
