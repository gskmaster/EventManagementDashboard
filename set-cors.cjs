const admin = require('firebase-admin');
const serviceAccount = require('./secrets/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const corsConfiguration = [
  {
    origin: ['*'],
    method: ['GET', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'],
    maxAgeSeconds: 3600,
    responseHeader: ['*']
  }
];

const bucketNames = [
  'gen-lang-client-0764930804.firebasestorage.app',
  'gen-lang-client-0764930804.appspot.com',
  'gen-lang-client-0764930804'
];

async function applyCors() {
  for (const name of bucketNames) {
    console.log('Trying bucket:', name);
    try {
      await admin.storage().bucket(name).setCorsConfiguration(corsConfiguration);
      console.log('✅ CORS configured successfully for:', name);
      process.exit(0);
    } catch (err) {
      console.log('❌ Failed for', name, ':', err.message);
    }
  }
  console.error("All bucket names failed.");
  process.exit(1);
}

applyCors();
