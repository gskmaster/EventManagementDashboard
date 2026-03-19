const { Storage } = require('@google-cloud/storage');
const path = require('path');

const storage = new Storage({
  keyFilename: path.join(__dirname, 'secrets/serviceAccountKey.json'),
  projectId: 'gen-lang-client-0764930804'
});

async function run() {
  try {
    const [buckets] = await storage.getBuckets();
    console.log("Buckets found:");
    buckets.forEach(b => console.log(b.name));
  } catch (err) {
    console.error("Error:", err.message);
  }
}
run();
