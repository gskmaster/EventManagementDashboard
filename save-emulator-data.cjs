const http = require('http');
const fs = require('fs');

async function saveEmulatorData() {
  console.log('💾 Triggering manual backup of emulator data...');
  
  const options = {
    hostname: 'localhost',
    port: 4400, // Hub port
    path: '/functions/export',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Export triggered successfully. Emulators are saving to firebase-data...');
      } else {
        console.error(`❌ Export failed with status ${res.statusCode}: ${data}`);
      }
      process.exit();
    });
  });

  req.on('error', (e) => {
    console.error(`❌ Connection error: ${e.message}`);
    console.error('Make sure the Firebase emulators are running (docker-compose up).');
    process.exit(1);
  });

  req.write(JSON.stringify({ path: 'firebase-data' }));
  req.end();
}

saveEmulatorData();
