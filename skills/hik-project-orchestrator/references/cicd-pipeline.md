# CI/CD & Production Stability

The overarching goal is to ensure high application robustness when deployed to production environments.

## 1. Pre-Deployment Checks
Before any code merges or production builds:
* Typescript and ESLint checks must pass without severe warnings.
* Run defined unit tests (where applicable, across both frontend and backend directories).
* Invoke `hik-devops-master` to verify Dockerfile validity and configuration integrity.

## 2. Continuous Integration Steps
Regardless of the platform (GitHub Actions, GitLab CI, etc.), standard pipeline steps should include:
- **Build Step**: Compiling Next.js assets, resolving Next.js build errors ahead of time.
- **Schema Validation**: Ensuring the database schema migrations are accounted for in Payload CMS deployments.

## 3. Continuous Deployment Framework
* Follow green/blue or staged deployment patterns. Confirm that Docker images pushed to the repository run properly in a staging VM before production rollouts.
* **Environment Synchronization**: Validate that the production environment contains all the newly added `.env` keys.

## 4. Stability Maintenance
* Ensure the architecture allows for rollbacks. If a deployment fails, it should be fast to revert to the previous reliable Docker image or codebase state.
* Delegate specific complex networking or deployment questions strictly to the `hik-devops-master` skill.
