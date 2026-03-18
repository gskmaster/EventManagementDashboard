const fs = require('fs');
const admin = require('firebase-admin');

// Load the service account key
const serviceAccount = require('./secrets/serviceAccountKey.json');

// Initialize Firebase Admin with Production credentials
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(app, 'ai-studio-e2e5d0b4-496d-416f-8fe2-52f9d835e885');
const auth = admin.auth();

async function exportData() {
  console.log('🔥 Connecting to Production Firebase...');
  const data = {
    firestore: {},
    auth: [],
    metadata: {
      exportedAt: new Date().toISOString(),
      databaseId: 'ai-studio-e2e5d0b4-496d-416f-8fe2-52f9d835e885'
    }
  };

  // 1. Export Firestore Collections (Dynamically)
  console.log('Listing collections in custom database...');
  try {
    const collections = await db.listCollections();
    console.log(`Found ${collections.length} collections.`);
    
    for (const coll of collections) {
      const collectionName = coll.id;
      console.log(`  📦 Downloading collection: ${collectionName}...`);
      const snapshot = await coll.get();
      data.firestore[collectionName] = [];
      
      snapshot.forEach(doc => {
        data.firestore[collectionName].push({ id: doc.id, data: doc.data() });
      });
      console.log(`     -> Got ${data.firestore[collectionName].length} documents.`);
    }
  } catch (err) {
    console.error('❌ Error listing collections:', err.message);
  }

  // 2. Export Auth Users
  console.log(`\n👥 Downloading Authentication users...`);
  try {
    let pageToken;
    let userCount = 0;
    do {
      const listUsersResult = await auth.listUsers(1000, pageToken);
      listUsersResult.users.forEach(userRecord => {
        data.auth.push({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          emailVerified: userRecord.emailVerified,
          phoneNumber: userRecord.phoneNumber,
          disabled: userRecord.disabled
        });
        userCount++;
      });
      pageToken = listUsersResult.pageToken;
    } while (pageToken);
    
    console.log(`  -> Got ${userCount} users.`);
  } catch (err) {
    console.error('❌ Error downloading users:', err.message);
  }

  // Write to dump.json
  console.log('\n💾 Writing to dump.json...');
  fs.writeFileSync('./dump.json', JSON.stringify(data, null, 2));
  console.log('✅ Successfully exported production data to dump.json!');
  process.exit(0);
}

exportData().catch(err => {
  console.error('Error exporting data:', err);
  process.exit(1);
});
