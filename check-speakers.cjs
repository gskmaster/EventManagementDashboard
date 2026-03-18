const admin = require('firebase-admin');
const serviceAccount = require('./secrets/serviceAccountKey.json');

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { getFirestore } = require('firebase-admin/firestore');

async function checkSpeakers() {
  console.log('🔍 Listing Collections in Production (Custom DB)...');
  
  const dbCustom = getFirestore(app, 'ai-studio-e2e5d0b4-496d-416f-8fe2-52f9d835e885');
  const collections = await dbCustom.listCollections();
  console.log('Found collections:');
  for (const coll of collections) {
    const snap = await coll.limit(1).get();
    console.log(` - ${coll.id} (${snap.size > 0 ? 'Has documents' : 'Empty'})`);
  }

  console.log('\n🔍 Listing Collections in Production (Default DB)...');
  const dbDefault = getFirestore(app);
  const collectionsDefault = await dbDefault.listCollections();
  console.log('Found collections:');
  for (const coll of collectionsDefault) {
    const snap = await coll.limit(1).get();
    console.log(` - ${coll.id} (${snap.size > 0 ? 'Has documents' : 'Empty'})`);
  }

  process.exit();
}

checkSpeakers();
