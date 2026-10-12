# Firebase release status and activation

The Firebase backend now implements core business commands, verified-account checks, user creation/reset, provider callbacks, consented contact dispatch, approved invoice email, AI reservations/deduplication, usage reports, export and deletion/cache maintenance. Arka is configured in Vapi. **Hosted business workflows remain unverified: the dedicated server credential and provider accounts are incomplete.** Paid billing and public deployment remain off.

## Authentication and authorization

The official Firebase Auth client handles signup, email verification, signin/signout and provider-hosted password recovery. The Worker verifies Google's RS256 signature, issuer, project audience, expiry and verified-email claim, then checks the active account using Firebase Auth. Server-only membership determines tenant and role. Clients cannot submit provider-controlled commands or direct Firestore writes. Sales views exclude private product costs, margins, expenses and audit records.

Atomic writes compare business and membership versions. Competing stock reservations cannot both consume the same stock. Admin-created Firebase users must verify their email; creation includes a server-enforced seat limit and compensation/reconciliation when membership creation fails.

## Activate locally without payment verification

1. Use project `solar-sales-desk-20261012`, native database `sales-native` in Mumbai. Billing is verified disabled. Spark's current allowances do not require payment information; do not enable a free-trial billing account for this setup.
2. Create a dedicated service account with Cloud Datastore User. Save its JSON privately as `.firebase-service-account.json` and run `npm run configure:firebase`. Direct admin password resets require the additional Firebase Authentication Admin role; self-service email recovery does not. Never grant Owner, Editor or billing roles merely to run the application.
3. Frontend `.env.local`: VITE_MODE=live, VITE_AUTH_PROVIDER=firebase, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID and VITE_API_URL. Worker `.dev.vars`: DATABASE_PROVIDER=firebase, FIREBASE_PROJECT_ID, FIREBASE_DATABASE_ID, FIREBASE_SERVICE_ACCOUNT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_WEB_API_KEY and exact ALLOWED_ORIGIN. The two web API key values are public app configuration; the private service key must never have a VITE prefix.
4. Configure confirmation/reset email templates, authorized domains, password policy and authentication abuse controls in the actual account. Verify real confirmation/recovery delivery before onboarding users.
5. Run `npm run check:live`, `npm run dev` and `npm run worker`. No public deployment is required for local staging.

## Provider activation

Bind the first calling/WhatsApp account to INTEGRATIONS_TENANT_ID. Set credentials, approved template/caller number, positive conservative INR estimates and visible per-user/day, business/day and monthly allowances. Keep WHATSAPP_ENABLED and VOICE_ENABLED false until the release checks pass. Set VAPI_ASSISTANT_REVIEWED only after reviewing its disclosure, consent, language and requirements script. No autonomous quotation approval or order tools are attached.

Vapi's authenticated end-of-call callback records captured requirements for staff review. Unknown outbound acceptance becomes Uncertain; it is never blindly retried. WhatsApp callbacks verify raw HMAC, sender binding, deduplication and opt-out. The initial provider account serves one explicit tenant; multi-business number/account provisioning is a separate rollout task.

Invoice email uses the existing approval, revision, delivery-lease and provider-idempotency controls. Reservations share an account-wide cap of 100/day and 3,000/month. Approval starts configured delivery; cron retries within the bounded lease window. Provider acceptance is not proof of delivery or payment.

AI hashes repeated requests, reserves per-user/tenant/application allowances atomically, validates output and records token/cost estimates. Pending/failed requests remain conservative budget reservations. Raw prompts are not persisted. Extracted-result caches expire after 24 hours through Worker maintenance; no paid TTL service is required. Reports apply the configured timezone, including UTC month-boundary cases. Spending estimates may lag actual provider bills.

## Operations and limits

The pilot retains a JSON aggregate per business with a 750 KB guard. This simplifies atomic stock/order workflows but costs more Firestore byte units as data grows; normalize and paginate before reaching that guard or sustained high volume. Core reads use exact document IDs. Small private maintenance queries use indexed document names/expiry fields; no continuous listeners or polling are introduced.

Admins export business data and complete usage history. Deletion revokes memberships, removes business records and purges private AI caches/ledgers. Large/incomplete purges remain marked for maintenance. Active/uncertain calls and sending invoices must be reconciled first. Authentication accounts, customer-received documents and provider-retained records require separate operator review.

Firebase backups/restores use `npm run firebase:data`; restores require a trusted same-project/database backup and maintenance mode, preserve membership grants and quarantine outbound work. They do not reconcile physical warehouse stock or provider bills automatically. Complete a real restore rehearsal before pilot launch.

## Required live release checks

Verified signup/login/reset; two businesses and separate admin/sales accounts; cross-tenant API attempts; concurrent stock reservation/cancellation; approval/revision behavior; a signed WhatsApp callback and approved template delivery; a consented India call and completion callback; malformed/timeout/unknown events; exhausted allowances; approved real invoice email; keyboard/mobile checks; printable customer documents; backup/restore and deletion; spending/rate/retention review. Public deployment requires explicit operator approval.

Local tests and build results are in TEST-RESULTS.md. These resources and fixtures do not establish production readiness by themselves.
