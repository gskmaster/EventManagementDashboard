# Cloud Run Setup & Best Practices

This guide covers the best practices for hosting your Vite SPA on Google Cloud Run while using Firebase for Authentication.

## 1. Hosting Architecture
For a static application (SPA), Cloud Run serves the app using a lightweight Nginx container. This is highly scalable and cost-effective.

### Key Configuration
- **Port**: Cloud Run dynamically assigns a port via the `$PORT` environment variable. Our `Dockerfile` is configured to use `envsubst` to inject this port into the Nginx config at runtime.
- **Protocol**: Cloud Run handles SSL/HTTPS automatically. Your app should always use relative paths or `APP_URL` for redirection.

## 2. Environment Variables & Security
Vite embeds environment variables at **build time**. Because of this, you must pass the Firebase configuration during the Docker build process.

### Local Mocking (.env)
Create a `.env` file for local development:
```bash
VITE_FIREBASE_PROJECT_ID="demo-event-management"
# ... other VITE_FIREBASE_* keys
```

### Production Build (Cloud Build)
When deploying to Cloud Run, use `--build-arg` to pass the production Firebase keys:
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/event-management-dashboard \
  --build-arg VITE_FIREBASE_API_KEY="AIzaSy..." \
  --build-arg VITE_FIREBASE_PROJECT_ID="gen-lang-client-0764930804" \
  # ... other keys
```

## 3. Deployment Flow (Best Practice)
The most robust way to deploy is using **Google Cloud Build** or a **GitHub Action**.

### Manual Deployment Command
```bash
# 1. Build and push image
gcloud builds submit --tag gcr.io/gen-lang-client-0764930804/dashboard:latest \
  --build-arg VITE_FIREBASE_API_KEY="AIzaSy..." \
  --build-arg VITE_FIREBASE_PROJECT_ID="gen-lang-client-0764930804"

# 2. Deploy to Cloud Run
gcloud run deploy event-management-dashboard \
  --image gcr.io/gen-lang-client-0764930804/dashboard:latest \
  --region us-west1 \
  --platform managed \
  --allow-unauthenticated
```

## 4. Authentication Best Practices
- **Session Management**: Firebase Auth persists sessions in `indexedDB`. This works seamlessly on Cloud Run.
- **CSRF Protection**: If you add a backend to Cloud Run later, ensure you verify the `Authorization: Bearer <ID_TOKEN>` header using the `firebase-admin` SDK.
- **Domain Whitelisting**: Ensure your Cloud Run URL is added to the "Authorized Domains" list in the **Firebase Console > Auth > Settings**.

## 5. Environment Isolation Summary
- **Local**: Uses Firebase Emulator (`demo-` project ID).
- **Production**: Cloud Run with build-time injected production keys.
