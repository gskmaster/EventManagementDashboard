const fs = require('fs');
const admin = require('firebase-admin');

// Ensure emulator routing
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Initialize Firebase Admin pointing to the local emulator
const app = admin.initializeApp({
  projectId: 'demo-event-management'
});

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(app); // Use (default) for local emulators
const auth = admin.auth();

async function importData() {
  console.log('🔌 Connecting to Local Firebase Emulators...');
  
  if (!fs.existsSync('./dump.json')) {
    console.error('dump.json not found! Run sync-export.js first.');
    process.exit(1);
  }

  const payload = fs.readFileSync('./dump.json', 'utf8');
  const data = JSON.parse(payload);

  // 1. Import Firestore Collections
  for (const [collectionName, docs] of Object.entries(data.firestore)) {
    console.log(`Importing collection: ${collectionName}...`);
    let count = 0;
    
    for (const doc of docs) {
      await db.collection(collectionName).doc(doc.id).set(doc.data);
      count++;
    }
    console.log(`  -> Wrote ${count} documents.`);
  }

  // 2. Import Auth Users
  console.log(`Importing Authentication users...`);
  let count = 0;
  
  for (const u of data.auth) {
    try {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        emailVerified: u.emailVerified,
        phoneNumber: u.phoneNumber,
        disabled: u.disabled === true
      });
      count++;
    } catch (e) {
      if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') {
        // Update user if they exist
        try {
            await auth.updateUser(u.uid, u);
            count++;
        } catch (updateErr) {
            console.error(`  -> Failed to update duplicate user ${u.email}:`, updateErr.message);
        }
      } else {
        console.error(`  -> Failed to import user ${u.email}:`, e.message);
      }
    }
  }
  
  console.log(`  -> Synced ${count}/${data.auth.length} users.`);

  console.log('\n✅ Successfully imported all data to local emulators!');
  
  // Clean up
  fs.unlinkSync('./dump.json');
  console.log('🗑️ Deleted temporary dump.json file.');
  process.exit(0);
}

importData().catch(err => {
  console.error('Error importing data:', err);
  process.exit(1);
});
