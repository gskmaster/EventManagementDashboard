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

## Local Emulator Setup & Environment Isolation

To ensure a robust and isolated development environment, follow these best practices for Firebase Emulators.

### 1. Project ID Isolation
Always use a `demo-` prefix for local development (e.g., `demo-local-project`).
- **Strictly Local**: Prevents the emulator from communicating with real Google Cloud project resources.
- **Predictable Mapping**: Ensures that data exported using a specific ID is correctly re-imported when using the same ID.

### 2. Configuration Consistency
Ensure the chosen `projectId` is consistent across all configurations:
- **`.firebaserc`**: Add it as a local alias.
  ```json
  "projects": {
    "production": "your-prod-id",
    "default": "demo-local-project"
  }
  ```
- **Application Code**: Explicitly override the `projectId` in development.
  ```javascript
  if (import.meta.env.DEV) {
    config.projectId = 'demo-local-project';
  }
  ```

### 3. Emulator Persistence
Configure your start scripts to automate data loading and saving:
- **`package.json`**:
  ```json
  "serve": "firebase emulators:start --project demo-local-project --import=./emulator-data --export-on-exit"
  ```
- **Manual Export**: To save data without stopping:
  ```bash
  firebase emulators:export ./emulator-data --project demo-local-project
  ```

### 4. Docker & Graceful Shutdown
When running emulators in Docker, ensure they have enough time to save data before the container is killed.
- **`docker-compose.yml`**:
  ```yaml
  services:
    firebase:
      # ... other config
      stop_grace_period: 120s # Essential for --export-on-exit
  ```

### 5. Multi-Database Handling
If your production uses a custom Firestore database name, strip it in development to point to the emulator's `(default)` database for a smoother UI experience.
```javascript
if (import.meta.env.DEV) {
  // Use (default) for emulators
  delete config.firestoreDatabaseId;
}
```
