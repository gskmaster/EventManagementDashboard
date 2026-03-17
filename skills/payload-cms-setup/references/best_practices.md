# Payload CMS 3.x Best Practices

## 1. Directory Structure
```
app/
├── (payload)/
│   ├── custom.css
│   ├── layout.tsx
│   └── page.tsx
└── (site)/
    ├── globals.css
    ├── layout.tsx
    └── page.tsx
```

## 2. Admin UI Layout Synchronization
When modifying the Admin UI or adding collections:
1. **Clean Rebuild**: Delete `.next` folder and run `npm run generate:importmap`.
2. **Metadata Flow**: Ensure the `importMap` is imported and passed down from the root `(payload)` layout to the segments `page.tsx`.
3. **Wait for Build**: In Docker, wait for the full Next.js production build to finish before verifying UI changes.
For Next.js 15 + Payload, use `output: 'standalone'` in `next.config.mjs`.
- Always include `.dockerignore` to exclude local `node_modules`.
- Pin specific versions in `package.json` to ensure build reproducibility.

## 3. Database Schema & Config
- **DATABASE_URI**: Use environment variables.
- **Migrations vs Push**: Use `push: true` for the postgres adapter **ONLY** during rapid prototyping or initial setup. Transition to **migrations** (`npx payload migrate:create`) as the project matures to ensure schema history is preserved and data is protected.
- **Status Checks**: Run `npx payload migrate:status` before and after all schema-altering code changes.
- **Image Support**: Ensure `sharp` is correctly installed if serving images (`npm install sharp@0.32.6`).

## 4. Next.js Configuration
```javascript
import { withPayload } from '@payloadcms/next/withPayload'
const nextConfig = {
  output: 'standalone',
  // other configs
}
export default withPayload(nextConfig)
```
