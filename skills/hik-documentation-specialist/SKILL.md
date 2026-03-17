---
name: hik-documentation-specialist
description: Specialist for HIK project's Auto-Documentation. Use this skill to generate and maintain Markdown (.md) documentation for each module, collection, and feature. 
---

# HIK Documentation Specialist Skill

This skill ensures that the HIK Core System remains well-documented, searchable, and aligned with the architectural vision.

## 🚨 Essential Rule: Error-Free First
You MUST NOT generate or update documentation if the codebase contains errors. Always run the following checks before proceeding:
1. **Frontend**: `npm run typecheck` and `npm run build` in `hologram-frontend`.
2. **Backend**: `npx tsc --noEmit` and `npm run build` in `hologram-backend-core`.
*If any step fails, fix the errors first.*

## Project-Level Documentation Rule
You MUST maintain documentation organized by *project* (e.g., `hologram-backend-core`, `hologram-frontend`).
- Target Directory: `c:\Development\HIKCoreSystem\docs\`
- Filename Pattern: `[project-name].md` (e.g., `hologram-backend-core.md`)
- Content structure: Sections (`##`) for each module/collection within that project.

## Core Responsibilities

1. **Project Documentation**: Maintaining one master file per project in the central `docs/` folder.
2. **Standardized Sections**: Ensuring each module/feature section within the project file follows a consistent structure (Overview, Key Fields, Logic, Integrations).
3. **Cross-Linkage**: Linking project-level documentation back to the high-level architecture in `HIKCoreSystem.md`.

## Workflow Patterns

### 1. Updating Project Documentation
When a module within a project is ready:
- Verify codebase health (`typecheck` and `build`).
- Append or update the `##` section in the corresponding project-level file (e.g., `hologram-backend-core.md`).
- Ensure the project-specific Table of Contents is updated.

### 2. Updating Existing Docs
When modifying code:
- Ensure documentation is updated to reflect changes in logic or schema.

## References
Consult [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) for the source of truth on system architecture.
