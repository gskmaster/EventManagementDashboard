const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const app = admin.initializeApp({
  projectId: 'demo-event-management'
});

const db = admin.firestore();

async function checkData() {
  console.log('🔍 Checking local emulator data...');
  const collections = await db.listCollections();
  
  if (collections.length === 0) {
    console.log('⚠️ No collections found in the default database.');
  } else {
    console.log(`✅ Found ${collections.length} collections:`);
    for (const col of collections) {
      const countSnapshot = await col.count().get();
      const totalDocs = countSnapshot.data().count;
      console.log(`   - ${col.id}: ${totalDocs} documents`);
    }
  }
}

checkData().catch(console.error);
