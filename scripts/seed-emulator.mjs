/**
 * Seed script for Firebase Emulator (REST API — no credentials needed)
 * Run with: node scripts/seed-emulator.mjs
 *
 * Creates:
 *  - 1 admin user in Auth emulator
 *  - Matching user profile in Firestore `users` collection
 *
 * Requires emulators to be running (docker-compose up)
 */

const PROJECT_ID = 'demo-event-management';
const DATABASE_ID = '(default)';
const AUTH_HOST = 'http://localhost:9099';
const FIRESTORE_HOST = 'http://localhost:8080';

const USERS = [
  { email: 'admin@demo.com', password: 'admin1234', displayName: 'Admin User', role: 'admin' },
  { email: 'admin@gsk.co.id', password: 'Lar45682!', displayName: 'Admin', role: 'admin' },
];

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function patch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      // 'owner' token bypasses Firestore rules in the emulator
      'Authorization': 'Bearer owner',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PATCH ${url} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

// --- Create or look up auth user via emulator REST API ---
async function upsertAuthUser({ email, password, displayName }) {
  const signupUrl = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  try {
    const data = await post(signupUrl, { email, password, displayName, returnSecureToken: true });
    console.log(`✅ Created auth user: ${email} (${data.localId})`);
    return data.localId;
  } catch (err) {
    if (err.message.includes('EMAIL_EXISTS')) {
      // Look up UID via admin endpoint
      const lookupUrl = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`;
      const res = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
        body: JSON.stringify({ email: [email] }),
      });
      const data = await res.json();
      const uid = data.users?.[0]?.localId;
      console.log(`ℹ️  Auth user already exists: ${email} (${uid})`);
      return uid;
    }
    throw err;
  }
}

// --- Write Firestore document via emulator REST API ---
async function setFirestoreDoc(collection, docId, fields) {
  const url = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collection}/${docId}`;
  await patch(url, { fields });
  console.log(`✅ Upserted Firestore /${collection}/${docId}`);
}

function strVal(s) { return { stringValue: s }; }
function tsVal(d) { return { timestampValue: d.toISOString() }; }

async function seed() {
  console.log('🌱 Seeding Firebase Emulator...\n');

  for (const user of USERS) {
    const uid = await upsertAuthUser(user);
    await setFirestoreDoc('users', uid, {
      email: strVal(user.email),
      displayName: strVal(user.displayName),
      role: strVal(user.role),
      createdAt: tsVal(new Date()),
    });
  }

  console.log('\n✨ Seed complete!');
  for (const u of USERS) {
    console.log(`  ${u.email} / ${u.password} (${u.role})`);
  }
  console.log('');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
