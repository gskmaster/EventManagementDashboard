---
name: payload-cms-setup
description: "Professional setup and installation guide for Payload CMS 3.x with Next.js 15. Use this skill when: (1) Initializing a new Payload project, (2) Upgrading Payload to 3.x, (3) Resolving UI/CSS conflicts in the Admin panel, (4) Debugging React hydration or ServerFunctionsProvider errors."
---

# Payload CMS 3.x Setup Skill

This skill provides a battle-tested workflow for setting up and maintaining Payload CMS 3.x in modern Next.js environments.

## Core Setup Workflow

### 1. Installation & Dependency Alignment
Always align `next` and `payload` versions to avoid peer dependency conflicts.
- **Recommended Versions**: `next@15.4.11` and `payload@3.77.0`.
- **Command**: `npm install next@15.4.11 react@^19.0.1 react-dom@^19.0.1 payload@3.77.0 @payloadcms/next@3.77.0`
- **Tip**: Use `--legacy-peer-deps` only if strictly necessary after aligning versions.

### 2. Layout Isolation (Route Groups)
To prevent global styles (like Tailwind Preflight) from breaking the Admin UI, isolate your site and payload layouts.
- Create `app/(site)` for your main website.
- Create `app/(payload)` for your CMS.
- **Why**: This prevents `app/layout.tsx` from wrapping the Admin panel, avoiding nested `html`/`body` tags and CSS conflicts.

### 3. Database Initialization (The "Push" Pattern)
Payload 3.x does not auto-push schema in production mode.
- Set `push: true` in your database adapter configuration.
- To initialize: Run the app in development mode (`npm run dev`) connected to your target database **locally** before deploying/containerizing.

## Specialized Knowledge & References

- **[Troubleshooting Guide](references/troubleshooting.md)**: Fixes for specific errors like hydration mismatch #418, `ServerFunctionsProvider` required, and build failures.
- **[Best Practices](references/best_practices.md)**: Configuration patterns for `next.config.mjs`, Docker setup, and the `importMap`.

## Critical Scripts

- **`generate:importmap`**: Ensure `"generate:importmap": "payload generate:importmap"` is in `package.json`. Run it via `npx` if the environment is isolated.
- **`importMap` Integration**: Ensure `app/(payload)/layout.tsx` and `app/(payload)/admin/[[...segments]]/page.tsx` pass the actual `importMap`. Avoid `importMap: {} as ImportMap`.
