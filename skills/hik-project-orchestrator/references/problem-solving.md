# Holistic Problem Solving Framework

Use this framework to diagnose and fix systemic issues, unblock progress, and address cross-stack bugs.

## 1. Triage & Reproduce
* Reproduce the issue accurately. If the issue is front-to-back (e.g., UI fails due to database timeout):
  * Check the frontend network requests (Payload format/headers).
  * Follow the request into the backend (Middleware, API route logs).
  * Trace the database query or external API call.

## 2. Log Analysis
* Correlate frontend generic 500 errors with the precise stack trace generated on the backend.
* Use Docker logs if running containerized environments (e.g., `docker-compose logs -f hikcoresystem`).

## 3. Delegation for the Fix
Once the root cause is isolated, hand off the implementation to the specific skill:
* Form validation failures or Next.js hydration bugs -> `hik-frontend-wizard`
* Payload CMS hooks, Database relation errors -> `hik-backend-expert`
* Nginx proxy timeouts, Docker image build failures -> `hik-devops-master`
* Connection issues with M365 -> `hik-integration-expert`

## 4. Post-Mortem Validation
* Re-test the comprehensive flow. Ensure that fixing a backend logic issue hasn't broken expected UI behavior.
