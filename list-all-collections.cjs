const admin = require('firebase-admin');
const serviceAccount = require('./secrets/serviceAccountKey.json');

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { getFirestore } = require('firebase-admin/firestore');

async function listAll() {
  const dbs = [
    { name: 'default', db: getFirestore(app) },
    { name: 'custom', db: getFirestore(app, 'ai-studio-e2e5d0b4-496d-416f-8fe2-52f9d835e885') }
  ];

  for (const { name, db } of dbs) {
    console.log(`\n--- Database: ${name} ---`);
    try {
      const collections = await db.listCollections();
      if (collections.length === 0) {
        console.log('No collections found.');
      }
      for (const coll of collections) {
        const snap = await coll.limit(1).get();
        console.log(` - ${coll.id} (${snap.size} docs)`);
      }
    } catch (e) {
      console.error(`Error listing ${name}: ${e.message}`);
    }
  }
  process.exit();
}

listAll();
