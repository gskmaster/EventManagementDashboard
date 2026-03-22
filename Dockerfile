# 1. Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./
RUN npm ci

# Copy the rest of the code
COPY . .

# Pass build-time environment variables for Vite
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_FIREBASE_FIRESTORE_DATABASE_ID
ARG VITE_RECAPTCHA_SITE_KEY
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_CONSENT_FUNCTION_URL

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID
ENV VITE_FIREBASE_FIRESTORE_DATABASE_ID=$VITE_FIREBASE_FIRESTORE_DATABASE_ID
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_CONSENT_FUNCTION_URL=$VITE_CONSENT_FUNCTION_URL

# Build Vite project to "dist" folder
RUN npm run build

# 2. Serve Stage (Lightweight Nginx)
FROM nginx:alpine

# Copy built assets to Nginx default public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Use a custom entrypoint to inject the $PORT into the nginx config
# Cloud Run provides the port via the $PORT environment variable (defaults to 8080)
RUN echo 'server { \
    listen ${PORT}; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/config.template

# Default port if not provided by Cloud Run
ENV PORT=8080

# Use a shell to sub in the $PORT variable before starting nginx
CMD sh -c "envsubst '\$PORT' < /etc/nginx/conf.d/config.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
