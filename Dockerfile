# 1. Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./
RUN npm ci

# Copy the rest of the code
COPY . .

# Build Vite project to "dist" folder
RUN npm run build

# 2. Serve Stage (Lightweight Nginx)
FROM nginx:alpine

# Copy built assets to Nginx default public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Overwrite default nginx config to support React Router SPA fallback
RUN echo "server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
