# Solar Sales Desk

A solar distributor sales application with catalogue matching, exact-money quotations, admin approval, follow-ups, stock-reserved orders, approved invoices and weekly/monthly/yearly reports. **Arka** is the configured Vapi requirements assistant.

**Release status (5 November 2026):** a Vercel production deployment is available at https://solar-sales-desk.vercel.app and currently requires Vercel authentication. It serves the landing page and clearly labeled local-preview workflow; live business authentication and persistence are disabled because Firebase server credentials and a hosted API origin are missing. WhatsApp, calling and invoice email remain disabled. Do not invite customers or enter business data until the live release gate below is complete. The GitHub repository is current through commit `af720f6`; automatic Vercel Git deployments are not connected.

## Sales workflow

Capture an enquiry → confirm interest and permission → agree a call time → gather requirements → staff review catalogue matches → calculate quotation → admin approval → deliberate customer sharing → follow-up/customer acceptance → transactional order reservation → draft invoice → admin approval → configured email delivery.

Editing an approved quote/invoice requires fresh approval. Customer documents omit cost prices and margins. AI extracts requirements; ordinary code calculates money. Arka has no order, payment or approval tools. Calls and messages respect consent, opt-out, request limits, spending estimates and duplicate protection.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The public landing page appears before account access. For key-free testing, open Log in → Local testing access → synthetic workspace. Live businesses start empty.

```sh
npm test
npm run db:test
npm run build
npx wrangler deploy --dry-run
```

The current full suite passes **81 automated tests**. Database isolation checks and a production build pass; the Worker dry bundle was also verified. Local protocol fixtures do not certify a real provider connection. `npm audit` reports zero known vulnerabilities after the November 2026 dependency patch.

## Live configuration

Read [Firebase release setup](docs/FIREBASE-RELEASE.md), [connection checklist](docs/LIVE-CONNECTIONS.md) and [calling setup](docs/CALLING-ACCOUNT-SETUP.md).

- Frontend public configuration goes in ignored `.env.local`.
- Worker credentials go in ignored `.dev.vars` locally and server secrets on the host. Never prefix privileged secrets with `VITE_`.
- `.env.example` contains placeholders. Never commit actual credentials, downloaded service-account keys or business backups.
- For Firebase, use the dedicated project `solar-sales-desk-20261012`, database `sales-native` in Mumbai. Billing is disabled; payment verification is not required for the current no-cost setup.
- A dedicated service account needs Cloud Datastore User. Direct admin password reset additionally needs Firebase Authentication Admin; email recovery does not. Use the minimum roles required.
- Save its JSON privately as `.firebase-service-account.json`, then run `npm run configure:firebase`. Configure the public Firebase web key, matching frontend/backend providers and exact allowed origin.
- Run `npm run check:live`. Run `npm run check:vapi` to inspect assistant/number IDs without placing calls.
- Keep outbound flags disabled until the staged release checks pass. Arka currently has no approved caller number linked. A recipient number does not supply a caller ID.

## Database safety

Firebase client rules deny direct business-data access; the trusted Worker verifies authentication, account status, tenant membership and role. Atomic commits compare membership and business versions, preventing competing orders from overselling. The Supabase option uses shared Postgres with RLS and audited RPCs; apply migrations 001–004 for that backend. Do not mix Firebase tokens with Supabase-only configuration.

The pilot uses a business aggregate with a 750 KB Firebase guard. Normalize and paginate before that limit or sustained high volume. Firestore Enterprise charges in byte units; free allowance consumption grows with aggregate size. Unknown provider acceptance requires reconciliation, never a blind retry.

## Backup and restore

Admins can export business data in Settings. Operator Firebase backups/restores use:

```sh
npm run firebase:data -- backup TENANT_UUID
npm run firebase:data -- restore BACKUP_FILE --confirm-restore
```

Restore requires `MAINTENANCE_MODE=true` both locally and on the Worker. Use a trusted backup for the same project/database and an existing target business. Restoration preserves membership grants, disables automatic calls and quarantines pending delivery jobs. Reconcile usage budgets, provider outcomes and physical stock before leaving maintenance. Provider-retained records and authentication-account deletion require operator review. See [operations](docs/OPERATIONS.md).

## Pilot and costs

[Onboarding checklist](docs/PILOT.md), [metric definitions](docs/REPORTS.md), [invoice workflow](docs/INVOICES.md), [cost assumptions](docs/COSTS.md) and [known limits](docs/LIMITATIONS.md).

Subscription fees are agreed manually; creating an account does not charge a customer. ₹2,000 is an operating budget proposal, not a guaranteed all-inclusive calling allowance. Provider bills can differ from delayed application estimates. No testimonials, revenue guarantees or unlimited-free claims are included.
