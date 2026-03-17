# Troubleshooting Firebase/GCP Connections

## Common Issues

### 1. `Error: error:0909006C:PEM routines:get_name:no start line`
This error occurs when the `private_key` parameter is improperly formatted, most commonly because the literal `\n` characters from the `.env` file are not being parsed as actual newlines.

**Fix:**
Ensure you replace the escaped newlines when initializing the SDK:
```typescript
privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
```

### 2. `Firebase ID token has incorrect "aud" (audience) claim`
This usually happens if multiple Firebase projects exist and the credentials initialized belong to one project, but the token being verified comes from a client connected to another project.

**Fix:**
Ensure `process.env.FIREBASE_PROJECT_ID` (backend) exactly matches `process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID` (frontend client).

### 3. Missing IAM Permissions (`403 Forbidden`)
A service account key requires sufficient roles assigned in the Google Cloud Console.

**Fix:**
1. Go to GCP Console -> IAM & Admin.
2. Ensure the service account has roles like "Firebase Admin", "Cloud Datastore User" (for Firestore), or "Storage Object Admin" (for Cloud Storage).

### 4. Cold Start Issues with `admin.initializeApp`
Calling `initializeApp` multiple times throws an error: `The default Firebase app already exists.` This frequently happens in Hot Module Replacement (HMR) environments like Next.js API routes or Serverless Functions.

**Fix:**
Check if an app already exists before initializing:
```typescript
if (!admin.apps.length) {
  admin.initializeApp({...});
}
```
