const fs = require('fs');
const admin = require('firebase-admin');

// Load the service account key
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin with Production credentials
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(app, 'ai-studio-e2e5d0b4-496d-416f-8fe2-52f9d835e885');
const auth = admin.auth();

const collections = ['users', 'institutions', 'persons', 'projects', 'speakers', 'payment_submissions'];

async function exportData() {
  console.log('🔥 Connecting to Production Firebase...');
  const data = {
    firestore: {},
    auth: []
  };

  // 1. Export Firestore Collections
  for (const collectionName of collections) {
    console.log(`Downloading collection: ${collectionName}...`);
    const snapshot = await db.collection(collectionName).get();
    data.firestore[collectionName] = [];
    
    snapshot.forEach(doc => {
      data.firestore[collectionName].push({ id: doc.id, data: doc.data() });
    });
    console.log(`  -> Got ${data.firestore[collectionName].length} documents.`);
  }

  // 2. Export Auth Users
  console.log(`Downloading Authentication users...`);
  let pageToken;
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
    });
    pageToken = listUsersResult.pageToken;
  } while (pageToken);
  
  console.log(`  -> Got ${data.auth.length} users.`);

  // Write to dump.json
  fs.writeFileSync('./dump.json', JSON.stringify(data, null, 2));
  console.log('\n✅ Successfully exported production data to dump.json!');
  process.exit(0);
}

exportData().catch(err => {
  console.error('Error exporting data:', err);
  process.exit(1);
});
