import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export { firebaseConfig };

const config = { ...firebaseConfig };
if (import.meta.env.DEV) {
  // Use a predictable project ID for local emulation
  config.projectId = 'demo-event-management';
  // Strip the production custom database ID so the emulator accurately uses the (default) database
  delete (config as any).firestoreDatabaseId;
}
const app = initializeApp(config);

// Use default database for local emulation so data shows up in the UI
export const db = import.meta.env.DEV 
  ? getFirestore(app) 
  : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Connect to local emulators if in development mode
if (import.meta.env.DEV) {
  console.log("🔥 Running Firebase connecting to local emulators");
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectStorageEmulator(storage, 'localhost', 9199);
}
