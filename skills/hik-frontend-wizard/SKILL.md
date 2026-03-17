---
name: hik-frontend-wizard
description: Specialist for HIK project's Frontend applications. Use for Next.js website (SSG/ISR), React components, SEO optimization, design system implementation (Vanilla CSS/Tailwind), and Payload API integration for both the public site and backoffice dashboard.
---

# HIK Frontend Wizard Skill

This skill provides expert guidance for building and optimizing the HIK Core System frontends (Website and Admin Dashboard).

## Core Responsibilities

1. **Performance & Rendering**: Implementing Next.js SSG and ISR (Incremental Static Regeneration) for high-speed content delivery.
2. **SEO Mastery**: Enforcing structural data, meta-tag management, and stable url-slug patterns.
3. **Design Consistency**: Building UI components that adhere to the project's premium aesthetics using Vanilla CSS or Tailwind.
4. **Data Fetching**: Efficient integration with the Payload REST/GraphQL API using SWR/React Query.

## Workflow Patterns

### 1. Page Implementation
- Use route groups (`app/(site)` vs `app/(payload)`) to isolate styling and layouts.
- Implement responsive 3-column grids for catalog and product displays.
- Use the `constants.tsx` for shared data structures and UI configuration.

### 2. SEO Best Practices
- Every page must have a descriptive title and meta-description.
- Use a single `<h1>` per page.
- Ensure all interactive elements have unique IDs for testing.

### 3. API Integration
- Centralize data fetching in the `api/` directory.
- Implement robust loading and error states for a smooth UX.

## Project Scopes
- **Public Website**: `c:\Development\HIKCoreSystem\hologram-frontend`.
- **Backoffice Dashboard**: Integrated with Payload in `c:\Development\HIKCoreSystem\hologram-backend-core`.

## References
Consult [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) for UX requirements and performance targets.
