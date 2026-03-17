---
name: firebase-gcp-manager
description: Manage connections between the project and Firebase or Google Cloud Platform (GCP). Use when Claude needs to work with Firebase or GCP for: (1) Generating service account keys and configuring .env variables, (2) Setting up Firebase Admin SDK, (3) Initializing frontend Firebase apps, (4) Managing GCP identity and access, or any related integrations.
---

# Firebase & GCP Manager

This skill helps set up and manage connections to Firebase and Google Cloud Platform (GCP).

## Quick Start

When determining what integration to setup, identify whether you need server-side access (Admin SDK / service account) or client-side access (Client SDK / web configuration).

**For Client-Side Web Configuration:**
- Refer to [references/firebase-setup.md](references/firebase-setup.md) for initializing the Firebase Web SDK.

**For Server-Side Admin Configuration:**
- Refer to [references/gcp-setup.md](references/gcp-setup.md) for generating service accounts and configuring environment variables securely.
- Refer to [references/firebase-setup.md](references/firebase-setup.md) for initializing the Firebase Admin SDK.

**For Troubleshooting:**
- If you encounter permission errors or missing configurations, review [references/troubleshooting.md](references/troubleshooting.md).
