import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics } from "firebase/analytics";
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
};

if (import.meta.env.DEV) {
  // Use a predictable project ID for local emulation
  firebaseConfig.projectId = 'demo-event-management';
}
const app = initializeApp(firebaseConfig);

// In DEV the emulator uses the (default) database; prod uses the named database
export const db = import.meta.env.DEV
  ? getFirestore(app)
  : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Use a specific region for Cloud Functions (defaulting to Indonesia/Jakarta for GSK projects)
// This fixes CORS preflight issues when functions are not in us-central1.
const region = import.meta.env.VITE_FIREBASE_REGION || 'asia-southeast2';
export const functions = getFunctions(app, region);

// Initialize Analytics conditionally (it requires measurementId and a browser context)
// We also disable it in DEV mode because Firebase Analytics does not have a local emulator
// and will fail with 403 trying to reach the real API using the 'demo-' project ID.
export const analytics = typeof window !== "undefined" && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID && !import.meta.env.DEV
  ? getAnalytics(app) 
  : null;

// Connect to local emulators if in development mode
if (import.meta.env.DEV) {
  console.log("🔥 Running Firebase connecting to local emulators");
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
