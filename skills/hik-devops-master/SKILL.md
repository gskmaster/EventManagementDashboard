---
name: hik-devops-master
description: Specialist for HIK project's Infrastructure and CI/CD. Manages Docker environments (Local/Prod), VPS deployment via GitHub Actions, and security protocols. Strictly follows the safety rules from @cicd_manager.
---

# HIK DevOps Master Skill

This skill provides expert guidance for managing the HIK Core System's deployment pipeline and infrastructure.

## Core Responsibilities

1. **Environment Consistency**: Managing `Dockerfile` and `docker-compose.yml` for both local development and production.
2. **CI/CD Orchestration**: Maintenance of GitHub Actions (`deploy.yml`) and ensuring non-breaking deployments.
3. **VPS Management**: Secure SSH access, volume management, and service monitoring on the Ubuntu VPS.
4. **Security & Performance**: Implementing SSL, backup strategies, and Docker image optimization.

## Strict CI/CD Protocols (Inherited from @cicd_manager)

### 1. Pre-Push Quality Gates
Before any push to `master`, you MUST verify:
- **Type Safety**: `npm run typecheck` passes.
- **Build Integrity**: `npm run build` succeeds.
- **Environment**: All new files are tracked in Git.

### 2. Troubleshooting Procedures
- **CI Failures**: Check for missing files (Git tracking) or lockfile (`package-lock.json`) mismatches.
- **Runtime Errors (500)**: Verify `.dockerignore` excludes `node_modules` and ensure Nginx permissions are corrected (`755` on `/usr/share/nginx/html`).
- **Dependencies**: Use `npm ci --legacy-peer-deps` for React 19 compatibility issues.

## Workflow Patterns

### Docker Development
- Use `docker-compose.dev.yml` for local hot-reloading (Port 3001).
- Ensure `CHOKIDAR_USEPOLLING=true` for reliable file watching in Windows/WSL environments.

### Deployment Flow
- Push to `master` triggers the `ci-check` -> `deploy` sequence.
- Monitor the GitHub Actions tab for success/failure logs.

## References
- **[CI/CD Agent Rules](file:///c:/Development/HIKCoreSystem/hologram-frontend/.agent/skills/cicd_manager/cicd_agent.md)**: Detailed troubleshooting and commands.
- **[Architecture Plan](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md)**: DevOps section for infrastructure targets.
