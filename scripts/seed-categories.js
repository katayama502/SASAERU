const admin = require('firebase-admin');
const path = require('path');

// サービスアカウントキーはプロジェクト外（~/.secrets/sasaeru/）に保管する。
// GOOGLE_APPLICATION_CREDENTIALS 環境変数があればそちらを優先。
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(require('os').homedir(), '.secrets/sasaeru/serviceAccountKey.json');
const serviceAccount = require(credentialsPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const categories = [
  { id: 'sports',  label: 'スポーツ',  slug: 'sports',  sort_order: 1 },
  { id: 'culture', label: '文化・芸術', slug: 'culture', sort_order: 2 },
  { id: 'welfare', label: '福祉',       slug: 'welfare', sort_order: 3 },
  { id: 'other',   label: 'その他',     slug: 'other',   sort_order: 4 },
];

async function seed() {
  // 各カテゴリの実際の公開org件数を集計してから投入
  const snap = await db.collection('organizations').where('status', '==', 'public').get();
  const countMap = { sports: 0, culture: 0, welfare: 0, other: 0 };
  snap.docs.forEach(d => {
    const cat = d.data().category;
    if (cat in countMap) countMap[cat]++;
  });

  console.log('カテゴリ別件数:', countMap);

  const batch = db.batch();
  for (const cat of categories) {
    const ref = db.collection('categories').doc(cat.id);
    batch.set(ref, { ...cat, count: countMap[cat.id] || 0 }, { merge: true });
    console.log(`  [${cat.id}] ${cat.label}: ${countMap[cat.id] || 0}件`);
  }
  await batch.commit();
  console.log('\n✓ categories コレクション投入完了');
  process.exit(0);
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
