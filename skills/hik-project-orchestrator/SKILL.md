---
name: hik-project-orchestrator
description: Master Orchestrator for the HIK Core System. Use for overall project guidance, feasibility analysis, coordinating between specialized skills (Backend, Frontend, DevOps, etc.), ensuring alignment with the original architecture, initiating new projects, resolving cross-stack development problems, and handling CI/CD processes to ensure robust production deployments.
---

# HIK Project Orchestrator Skill

This is the central intelligence skill for the HIK Core System project. It provides high-level strategic guidance and ensures all development activities align with the project's core mission.

## Core Responsibilities

1. **Architectural Stewardship**: Ensuring all new features and modifications strictly adhere to the [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) architecture.
2. **Project Initiation**: Bootstrapping new projects or features. See [references/project-initiation.md](references/project-initiation.md).
3. **Skill Coordination**: Determining which specialized skill (Backend, Frontend, Mobile, Integration, DevOps) should be invoked for a given task.
    - *Backend Expert*: For data schema and Payload logic.
    - *Frontend Wizard*: For UI/UX and Next.js performance.
    - *Mobile Specialist*: For Expo/React Native apps.
    - *Integration Expert*: For M365 and external financial APIs.
    - *DevOps Master*: For deployment and server management.
4. **Holistic Problem Solving**: Analyzing complex issues that span multiple stacks. See [references/problem-solving.md](references/problem-solving.md).
5. **CI/CD & Production Stability**: Orchestrating build, test, and deployment workflows. See [references/cicd-pipeline.md](references/cicd-pipeline.md).

## Decision Framework

When a new request arrives, use this skill to:
1. **Analyze Constraints**: Evaluate time, tech stack compatibility, and security implications.
2. **Delegate or Follow References**: Assign tasks to the relevant specialized expert or dive into one of the specialized frameworks (Initiation, Problem Solving, CI/CD).

## Strategic Principles
- **Robustness First**: Prefer stable, well-documented patterns over experimental features.
- **Premium Aesthetics**: Maintain the "Wow" factor in all user interfaces.
- **Security-Minded**: Zero-trust approach to data access and external integrations.

## Primary References
- **[Full Architecture Design](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md)**: The definitive source of truth for the project.
- **[Project Initiation](references/project-initiation.md)**: Guide on scaffolding and starting.
- **[Problem Solving](references/problem-solving.md)**: Framework for diagnosis and cross-stack troubleshooting.
- **[CI/CD Pipeline](references/cicd-pipeline.md)**: Deployment and automation strategy.
