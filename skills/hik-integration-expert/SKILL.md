---
name: hik-integration-expert
description: Specialist for HIK project's External Integrations. Use for connecting Payload CMS with Microsoft 365 (Graph API, SSO), accounting software (Jurnal, Paper.id), and payment gateways (Midtrans/Xendit).
---

# HIK Integration Expert Skill

This skill provides specialized knowledge for orchestrating data flow between the HIK Core System and third-party platforms.

## Core Responsibilities

1. **Identity & Productivity**: Implementing Microsoft SSO and integrating with Teams/Outlook via the Graph API.
2. **Financial Sync**: Automating data push from Quotations/Invoices to Jurnal or Paper.id.
3. **Payments Flow**: Managing webhook integrations for payment gateways to ensure real-time status updates in the CMS.
4. **Master Data Sync**: Maintaining consistency between the CMS and external ERP/accounting systems.

## Workflow Patterns

### 1. Microsoft Graph Integration
- Configure app registrations and scopes for email notifications and calendar events.
- Implement SSO for backoffice access.

### 2. Accounting Webhooks
- Use Payload `afterChange` hooks to trigger accounting API calls.
- Implement retry logic and logging for failed sync attempts.

### 3. Payment Reconciliation
- Securely handle payment gateway webhooks.
- Update asset availability and booking statuses automatically upon successful payment.

## Technical Requirements
- **Security**: Strict management of API keys and client secrets (never hardcoded).
- **Resilience**: Asynchronous execution for time-consuming API operations.

## References
Consult [HIKCoreSystem.md](file:///c:/Development/HIKCoreSystem/HIKCoreSystem.md) for the integration module specifications.
