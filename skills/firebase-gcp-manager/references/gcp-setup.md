# GCP & Firebase Service Account Setup

This guide walks through creating and configuring a service account in Google Cloud Platform (GCP) or Firebase for use in the application.

## 1. Creating a Service Account

### Via Firebase Console (Recommended for mostly Firebase features)
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Click the gear icon next to "Project Overview" and select **Project settings**.
4. Go to the **Service accounts** tab.
5. Click **Generate new private key** and download the JSON file.

### Via Google Cloud Console (Recommended for wider GCP API usage)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project.
3. Navigate to **IAM & Admin > Service Accounts**.
4. Click **Create Service Account**, fill in details, and grant necessary roles (e.g., Editor, Firebase Admin, Storage Object Admin depending on needs).
5. Open the created service account, go to the **Keys** tab.
6. Click **Add Key > Create new key** and select JSON.

## 2. Setting Environment Variables

Extract the necessary fields from the downloaded JSON file and map them securely to your `.env` file depending on the SDK configuration. typically:

```env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIB...some...key...data...\n-----END PRIVATE KEY-----\n"

# Optional: Realtime DB URL
FIREBASE_DATABASE_URL="https://your-project-id.firebaseio.com"
```

**CRITICAL NOTE ON `FIREBASE_PRIVATE_KEY`**: 
Ensure that newline characters `\n` in the private key string are properly formatted for your runtime environment. In Node.js when reading from `process.env`, you may need to replace escaped newlines with actual newline characters:
`process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')`

## 3. Web Client SDK Environment Variables

If setting up the frontend web client, configure these variables instead (or in addition):

```env
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"
NEXT_PUBLIC_FIREBASE_APP_ID="1:123456:web:abcd123"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="G-123456"
```

Find these details in the Firebase Console under **Project settings > General > Your apps**.
