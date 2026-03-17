---
name: hik-backend-expert
description: Specialist for HIK project's Backend architecture. Use when working with Payload CMS 3.x, PostgreSQL, collection definitions, hooks, server-side business logic, and database migrations for the HIK Core System.
---

# HIK Backend Expert Skill

This skill provides specialized guidance for developing and maintaining the backend of the HIK Core System using Payload CMS and PostgreSQL.

## Core Responsibilities

1. **Schema & Collection Management**: Defining and refining Payload collections (Users, Products, Assets, Bookings, etc.).
2. **Business Logic & Hooks**: Implementing `beforeChange`, `afterChange`, and `beforeDelete` hooks to enforce business rules.
3. **Database Integrity**: Managing PostgreSQL relationships, indexing strategies, and transactional consistency.
4. **API Development**: Extending current REST/GraphQL endpoints with custom logic.

## Workflow Patterns

### 1. Defining Collections
When creating or modifying collections:
- **Slug Management**: Ensure stable slugs for routing (avoiding dependencies on localized titles).
- **Access Control**: Strict RBAC based on user roles (Admin, Sales, Field Staff, etc.).
- **Validation**: Server-side validation within hooks to ensure data quality.

### 2. Implementation of Hooks
- **Quotation -> Project**: Trigger project creation automatically when a Quotation status is updated to `Deal`.
- **Media Optimization**: Ensure proper absolute path resolution for file uploads in Docker environments.
- **Dependency Syncing**: Use `afterChange` hooks to push data to external APIs (Microsoft Graph, Jurnal, Paper.id).

## Project Scopes
- **Collections**: Managed in `c:\Development\HIKCoreSystem\hologram-backend-core\collections`.
- **Configurations**: Located in `c:\Development\HIKCoreSystem\hologram-backend-core\payload.config.ts`.

## References
Consult the [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) for the high-level architecture and data module breakdowns.
