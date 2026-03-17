# Firebase Setup Guide

## Server-Side (Admin SDK) Initialization

When setting up the Admin SDK in a Node.js project, typically for backend or CMS integration:

```javascript
import * as admin from 'firebase-admin';

// Check if already initialized to prevent errors in hot-reloading environments
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace literal escaped newlines with actual newlines
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL, // If using Realtime Database
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
```

Requires setting `.env` variables correctly (see [gcp-setup.md](gcp-setup.md)).

## Client-Side (Web SDK) Initialization

When setting up Firebase for a frontend web application:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

Ensure environment variables are prefixed correctly depending on the framework (e.g., `NEXT_PUBLIC_` for Next.js, `VITE_` for Vite).
