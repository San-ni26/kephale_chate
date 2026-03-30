# Implementation Plan: Decrypt PII (Email & Phone) across all API Routes

This design document outlines the necessary changes to ensure that all `email` and `phone` data retrieved from the database is properly decrypted before being returned to the client or used in server-side logic (like sending emails). 

## User Review Required

> [!WARNING]
> This refactor touches many files (over 30 API routes) where user emails and phones are fetched from the database but bypass the `decryptPII` utility.
> I will systematically apply `decryptUserPII` (for JSON responses) and `decryptPII` (for direct variable usages) across all identified endpoints.

## Background Context
The Kephale Chat application stores sensitive Personally Identifiable Information (PII) like `email` and `phone` in an encrypted state in the database using AES-256-GCM (managed by `encryptPII` / `decryptPII` in `src/lib/server-crypto.ts`).
However, many newly created or updated API routes read these fields from Prisma without decrypting them. As a result, endpoints might return encrypted hashes to the frontend, leading to UI bugs or failures in email deliveries (e.g. attempting to send an email to an encrypted string).

The solution is to use:
1. `decryptUserPII(data)` on JSON payloads sent via `NextResponse.json(...)` that contain user lists or objects. This recursive function will automatically find and decrypt `email` and `phone` fields.
2. `decryptPII(user.email) || user.email` when directly accessing the variable server-side (for example, before calling `sendUnreachablePhoneNotificationEmail` or sending invitations).

## Proposed Changes

I have identified the following files that currently skip decryption and will be updated.  These files need `import { decryptUserPII, decryptPII } from '@/src/lib/server-crypto'` and the appropriate updates in their handler functions. We will group them functionally:

### Admin API Routes
Will wrap `NextResponse.json` payloads in `decryptUserPII`.
#### [MODIFY] `app/api/admin/users/route.ts`
#### [MODIFY] `app/api/admin/users/[id]/route.ts`
#### [MODIFY] `app/api/admin/payment-orders/route.ts`
#### [MODIFY] `app/api/admin/organizations/route.ts`
#### [MODIFY] `app/api/admin/departments/route.ts`
#### [MODIFY] `app/api/admin/performance/route.ts`

### Admin Actions (Direct Usage)
Need `decryptPII` for server-only operations.
#### [MODIFY] `app/api/admin/payment-orders/[id]/notify-unreachable/route.ts`

### Organizations API Routes (Jobs & Members)
Will wrap `NextResponse.json` payloads in `decryptUserPII`.
#### [MODIFY] `app/api/organizations/[id]/jobs/route.ts`
#### [MODIFY] `app/api/organizations/[id]/jobs/[jobId]/route.ts`
#### [MODIFY] `app/api/organizations/[id]/departments/[deptId]/tasks/[taskId]/route.ts`
#### [MODIFY] `app/api/organizations/[id]/departments/[deptId]/members/route.ts`
#### [MODIFY] `app/api/organizations/[id]/departments/[deptId]/members/[memberId]/route.ts`

### Groups API Routes
Will wrap `NextResponse.json` payloads in `decryptUserPII`.
#### [MODIFY] `app/api/groups/route.ts`
#### [MODIFY] `app/api/groups/[groupId]/members/route.ts`
#### [MODIFY] `app/api/groups/[groupId]/documents/[docId]/route.ts`
#### [MODIFY] `app/api/groups/[groupId]/documents/[docId]/notes/route.ts`
#### [MODIFY] `app/api/groups/[groupId]/documents/[docId]/notes/[noteId]/route.ts`

### Messaging & Calls API Routes
Will wrap `NextResponse.json` payloads in `decryptUserPII`.
#### [MODIFY] `app/api/messages/route.ts`
#### [MODIFY] `app/api/messages/[id]/route.ts`
#### [MODIFY] `app/api/call/status/route.ts`
#### [MODIFY] `app/api/call/signal/route.ts`

### Conversations API Routes
Will wrap `NextResponse.json` payloads in `decryptUserPII`.
#### [MODIFY] `app/api/conversations/[id]/route.ts`
#### [MODIFY] `app/api/conversations/[id]/messages/route.ts`
#### [MODIFY] `app/api/conversations/[id]/shared-notes/route.ts`
#### [MODIFY] `app/api/conversations/[id]/purchase-rights/route.ts`
#### [MODIFY] `app/api/conversations/[id]/lock/route.ts`
#### [MODIFY] `app/api/conversations/[id]/change-lock-code/route.ts`

### Core APIs (Announcements, Subscriptions & External Integrations)
#### [MODIFY] `app/api/announcements/route.ts`
#### [MODIFY] `app/api/user-pro/subscribe/route.ts`
#### [MODIFY] `app/api/invitations/[token]/update/route.ts` (For `sendInvoiceEmail`)
#### [MODIFY] `app/api/pusher/auth/route.ts` (Requires explicit `decryptPII(user.email)`)

## Open Questions

None at this time. The pattern to apply is mechanical and consistent across the codebase. 

## Verification Plan

### Automated Tests
- I will run TypeScript linting locally to ensure no missing imports.

### Manual Verification
- We will verify that API calls to these routes no longer return the `hex:hex:hex` encrypted string format but instead return the plaintext email/phone.
