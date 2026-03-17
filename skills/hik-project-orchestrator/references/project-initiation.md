# Project Initiation Guide

When initiating a new project or major feature module within the HIK Core System ecosystem, follow this unified framework.

## 1. Requirement & Architecture Alignment
* Review [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) to ensure the new initiative aligns with the microservices or overarching architecture.
* Define clear boundary constraints between frontend (Next.js/React Native), backend (Payload CMS), and any external integrations (M365, etc.).

## 2. Scaffolding Phase
Delegate initial scaffolding to the appropriate domain expert:
* **Frontend**: Invoke `hik-frontend-wizard` to bootstrap Next.js templates or build out the initial UI using defined premium aesthetic patterns.
* **Backend**: Invoke `hik-backend-expert` to set up Payload CMS schemas and foundational API routes.
* **Database/Infra**: Ensure the schema is synchronized and necessary tables/collections exist before major development begins.

## 3. Environment & Configuration
Ensure standard structures are in place:
* Establish `.env.example` templates covering API keys, Firebase IDs, and internal backend URLs.
* Follow the zero-trust security model from day one by validating authentication across all newly created endpoints.
