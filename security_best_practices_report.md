# Security Best Practices Report

## Executive Summary

This review found several concrete server-side risks in the current Next.js app and applied code fixes for the highest-impact issues in this pass. The most important fixes were: blocking SSRF through the proxy endpoint, enforcing organization membership checks on organization detail reads, validating that reorder and parent-folder references stay inside the current project, tightening user and role input validation, and ignoring the local SQLite database file at the repo root.

## High Severity

### SBP-001: SSRF exposure in the proxy endpoint

- Status: fixed
- Location: [src/app/api/proxy/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/proxy/route.ts#L24), [src/lib/security.ts](/Users/sam/Code/DogeOW/apixdocs/src/lib/security.ts#L96)
- Evidence:
  - The proxy route now validates URL scheme and host, rejects loopback/private network targets, strips unsafe hop-by-hop headers, disables redirect following, and limits response size/time.
- Impact:
  - Before this fix, any authenticated user could have used the server as a blind fetcher for internal services or metadata endpoints.
- Fix:
  - Added centralized URL/header validation and bounded response reading in [src/lib/security.ts](/Users/sam/Code/DogeOW/apixdocs/src/lib/security.ts#L71), then enforced it in [src/app/api/proxy/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/proxy/route.ts#L36).

### SBP-002: Missing object-level authorization on organization detail reads

- Status: fixed
- Location: [src/app/api/organizations/[id]/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/organizations/[id]/route.ts#L19)
- Evidence:
  - The route now requires an `organizationMember` record before returning the organization and member list.
- Impact:
  - Without this check, any authenticated user who knew an organization ID could read membership data for an unrelated organization.
- Fix:
  - Added membership verification ahead of the `findUnique` call in [src/app/api/organizations/[id]/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/organizations/[id]/route.ts#L20).

## Medium Severity

### SBP-003: Cross-project reference injection in reorder and create flows

- Status: fixed
- Location: [src/app/api/projects/[id]/reorder/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/projects/[id]/reorder/route.ts#L61), [src/app/api/endpoints/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/endpoints/route.ts#L68), [src/app/api/folders/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/folders/route.ts#L55), [src/app/api/folders/[id]/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/folders/[id]/route.ts#L52)
- Evidence:
  - The reorder route now rejects invalid folder/endpoint references outside the current project.
  - Folder creation/update now validates `parentId`.
  - Endpoint creation now validates `folderId`.
- Impact:
  - A user with access to one project could otherwise attach or reorder resources against unrelated project folders/endpoints if they knew those IDs.
- Fix:
  - Added runtime ownership checks and parent/self-reference guards to the affected routes.

### SBP-004: Weak credential and role normalization on user management paths

- Status: fixed
- Location: [src/app/api/users/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/users/route.ts#L63), [src/lib/auth.ts](/Users/sam/Code/DogeOW/apixdocs/src/lib/auth.ts#L14), [src/app/api/organizations/[id]/members/route.ts](/Users/sam/Code/DogeOW/apixdocs/src/app/api/organizations/[id]/members/route.ts#L36)
- Evidence:
  - Emails are normalized to lowercase before lookup/create.
  - Passwords must meet a minimum length.
  - Roles are validated against allowlists.
  - Org admins can no longer grant the `owner` role.
  - Password verification now uses async bcrypt instead of blocking sync calls.
- Impact:
  - These issues could cause inconsistent authorization behavior, weaker credentials, or privilege escalation by inconsistent role casing/assignment.
- Fix:
  - Added shared security helpers and enforced them across auth and user-management routes.

### SBP-005: Local development database at repo root was not ignored

- Status: fixed
- Location: [.gitignore](/Users/sam/Code/DogeOW/apixdocs/.gitignore#L45)
- Evidence:
  - `dev.db` existed at the repository root, but only `prisma/dev.db` was ignored before this pass.
- Impact:
  - The local SQLite database could have been committed accidentally, exposing development data and credentials.
- Fix:
  - Added root-level `dev.db` and `dev.db-journal` ignores in [.gitignore](/Users/sam/Code/DogeOW/apixdocs/.gitignore#L45).

## Residual Items To Verify

### SBP-R1: Deployment secret configuration

- Status: not verifiable from app code alone
- What to verify:
  - Ensure `AUTH_SECRET` or equivalent NextAuth production secret is configured securely in deployment environment variables.

### SBP-R2: Edge protections

- Status: not visible in repo code
- What to verify:
  - Add rate limiting for login and proxy endpoints at the edge or reverse proxy.
  - Confirm CSP, `X-Content-Type-Options`, and framing policy headers are set in deployment infrastructure if they are not handled in-app.
