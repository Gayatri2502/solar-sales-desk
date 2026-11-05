# Live activation checklist

Status (5 November 2026): a Vercel production deployment is READY at https://solar-sales-desk.vercel.app, with Vercel Authentication protection enabled. It was deployed from the current GitHub source snapshot; Git-based automatic deployments are not connected. Live authentication/database and outbound providers are not active, so this is a protected landing page/local preview, not a customer-ready live ERP. Local test data is available only through an explicit testing entry. Live businesses begin empty. A successful build is not proof of successful provider delivery.

## Decisions and non-secret details needed from the operator

1. Confirm whether Firebase Auth and Firestore replace the existing Supabase Auth/Postgres implementation. The current implementation still uses Supabase. Firebase is not connected. Changing engines requires replacement authorization, transaction, and isolation tests; adding a second database does not improve the pilot.
2. Provide your WhatsApp Business account/phone-number ID, approved qualification template name and language, current Graph API version, and account rate card. Confirm permission wording and inbound qualification reply options.
3. Provide your voice provider choice. The prepared adapter uses Vapi with an approved imported calling number. Supply Vapi assistant ID and phone-number ID, originating phone number, supported India calling carrier/SIP details and rates. A Vapi account alone does not establish an approved Indian calling number. Other calling providers require a separate adapter.
4. Provide real business/operator name, address, support email, public domain, subscription fees, seats, usage allowances, renewal/cancellation terms, and whether ₹2,000 covers all infrastructure or communications only. Public plans currently say Contact for pricing; no invented fees or automatic payment collection.
5. Provide the verified invoice sender domain/address and your chosen authentication email delivery configuration. Invoice email credentials alone do not configure authentication confirmation/reset emails.

Do not paste secrets in conversation. Copy `.env.example` public values to ignored `.env.local`; place server secrets in ignored `.dev.vars` for local testing or Cloudflare Worker secrets for deployment. Never prefix privileged keys with VITE_. Never commit these files. Configure actual values using provider dashboards or local secure entry.

## Existing database and login

Public frontend: VITE_MODE=live, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL, VITE_SUPPORT_EMAIL. Worker: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN (exact frontend origin).

Apply migrations 001 through 004 in order. Configure signup email verification, permitted site/redirect URLs, reliable confirmation/reset SMTP delivery, and authentication abuse/rate controls. The Worker rejects unconfirmed email accounts. Signup does not activate a paid subscription. The first confirmed user onboards a business; admin-created users remain the pilot team workflow. Verify separate admin and sales accounts, two unrelated businesses and cross-tenant requests in staging.

## WhatsApp

Worker values: WHATSAPP_ENABLED=false initially; WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_GRAPH_VERSION, WHATSAPP_QUALIFICATION_TEMPLATE, WHATSAPP_TEMPLATE_LANGUAGE, WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR, INTEGRATIONS_TENANT_ID.

Register GET/POST `https://YOUR-WORKER/api/hooks/whatsapp` with Meta and subscribe to messages/status updates. POST verifies raw-body HMAC before processing. Sender phone-number IDs must match the configured business binding. Replayed message IDs do not duplicate leads. Unknown inbound senders create a lead requiring staff verification and recorded permission; receiving a message does not silently grant calling consent. Exact configured interest replies qualify; free text stays for staff review. STOP removes calling permission and cancels queued contact.

Validate approved template payload, current Meta account terms, permission requirements and rates in the actual account before enabling. Provider acceptance is separate from delivered/read receipts. No automatic WhatsApp quote/invoice sharing is implemented; approved invoices currently use email.

## Voice and calling

Worker values: VOICE_ENABLED=false initially; VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID, VAPI_WEBHOOK_SECRET, VOICE_MAX_SECONDS (default 180), VOICE_ESTIMATE_INR_PER_MINUTE_MINOR, VAPI_ASSISTANT_REVIEWED=false initially, INTEGRATIONS_TENANT_ID.

Review and configure the assistant using `voiceAssistantGuide` in `server/integrations/providers.ts`. Disclose the automated assistant, confirm consent, respect stop requests, collect requirements and avoid compatibility/pricing promises. Do not provide tools that bypass quotation approval. Configure the assistant server URL `https://YOUR-WORKER/api/hooks/voice` with an Authorization Bearer credential equal to VAPI_WEBHOOK_SECRET and end-of-call-report events. Verify actual provider event shape in staging. The application stores a transcript for staff review, not a verified product selection or customer acceptance. Quality and actual cost remain unreviewed until recorded; provider USD costs are not silently converted into fictitious INR bills.

Set VAPI_ASSISTANT_REVIEWED=true only after this review. Configure positive conservative rate estimates, per-user/day, business/day and monthly caps in Settings. Automatic calls are off by default and require the admin checkbox plus server activation. The five-minute scheduled Worker processes at most two due appointments per run; it is not an exact-time/high-volume dialler. Only customer-agreed due appointments can start. One claim per job prevents duplicate starts; unknown provider acceptance becomes Uncertain and requires operator reconciliation, never blind retry. Accepted calls without completion reports also need provider-console reconciliation before another call. No recording storage or voice retry without renewed agreement is provided.

The initial provider account is bound to one INTEGRATIONS_TENANT_ID. Other businesses cannot use its credentials. Production multi-business provider provisioning and per-account credential storage are still required before selling automated contact to multiple tenants.

## Invoice delivery and AI

Approved invoice email: RESEND_API_KEY, INVOICE_FROM_EMAIL, INVOICE_EMAIL_ENABLED=false initially. See INVOICES.md for approval, idempotency, provider acceptance, retry limits and cancellation reconciliation.

AI extraction: OPENAI_API_KEY, AI_PROVIDER, AI_ENABLED, AI_MODEL, input/output token prices and APP_SPEND_CEILING_USD. Keep disabled until the model/data terms, budget and configured prices are verified. Manual entry remains available. AI never calculates money, approves documents, or creates orders from a transcript.

## Release gate

Use your own consenting test contacts. Verify signup, confirmation, reset, login, logout, business onboarding, two-tenant isolation, sales restrictions, approved template send and signed inbound/receipts, duplicate webhook, opt-out, one agreed test call/end report, malformed webhook, timeout/uncertain reconciliation, caps, reviewed matching, quote revision/reapproval, accepted order stock reservation, invoice approval and real email delivery. Confirm database backup restore, monitoring, retention/deletion policy, privacy/terms and provider invoices. Inspect CSP connect-src for the chosen API domain. Public deployment and billing require separate approval.

Sources: [Vapi calling setup](https://docs.vapi.ai/quickstart/phone), [Vapi pricing](https://vapi.ai/pricing), [Firebase pricing](https://firebase.google.com/pricing). Meta account verification remains required; automated documentation retrieval was unavailable, so current account payload/terms have not been certified here.

## Connection inspection — 12 October 2026

At the 12 October 2026 inspection, the Vercel team had no project matching “solar”; a protected project and production deployment have since been created. The app's ignored local `.env.local` and `.dev.vars` files are not deployed as source. Firebase server credentials remain absent. No live calling or messaging connection was verified. The operator's authorized test-call recipient is kept privately outside the application bundle and repository; it is not a public business support number.

Run `npm run check:live` from the application directory after configuration. It prints missing variable names and activation flags, never secret values, and performs no external requests. A passing configuration check still requires the staging release gate above. Vercel access does not grant Firebase, Meta, Vapi, carrier or Cloudflare access.

## Firebase and voice selection update — 12 October 2026

Firebase plugin authentication is now verified. The operator authorized a dedicated Solar Sales Desk project with paid billing disabled and selected Twilio or Vapi for calling. Project creation is in progress; existing unrelated Firebase projects must not be altered. Vapi remains the implemented voice adapter. A calling account, assistant and approved outbound number are still needed; the recipient phone is not a caller ID or provider credential. No calls, public hosting or paid account features have been activated.

Firebase project solar-sales-desk-20261012 and web app 1:594920646696:web:742653b802e78d369f2d1d are now created; email/password authentication configuration deployment succeeded. Billing was verified disabled. Database verification found MongoDB-compatible access mode rather than native Firestore; replacing the newly created empty database requires operator permission and is pending. The React/Worker data layer still uses Supabase; Firebase SDK/business transaction migration has not been activated. See CALLING-ACCOUNT-SETUP.md for the separate calling registration handoff.

Correction verified: with operator permission, the empty MongoDB-compatible database was removed. The replacement sales-native database is Enterprise/native Firestore in asia-south1, with firestoreDataAccessMode enabled, MongoDB access disabled, and freeTier true. Closed client rules were successfully deployed (job 1791828084943). Firebase billing remains disabled. The Firebase Auth and Worker/store adapter is implemented, but its live business workflow still needs the dedicated server credential and an authenticated smoke test.

## Vercel hosting status — 5 November 2026

Project `solar-sales-desk` was created in the connected Vercel team with deployment protection enabled. The production deployment is READY at https://solar-sales-desk.vercel.app. `vercel curl` verified that the deployment serves the app shell. It is not publicly accessible without Vercel authentication and is not a live customer ERP. The deployment was uploaded from the GitHub `main` source snapshot; a GitHub-to-Vercel repository connection was intentionally not enabled, so future commits require an explicit deployment. The live release check still reports missing Firebase service-account credentials, WhatsApp credentials/template/number/cost settings, Vapi number/webhook/cost settings, and verified invoice sender credentials; all outbound flags remain disabled. Complete the authenticated live smoke tests and operational/privacy review before lifting deployment protection or onboarding customers.

## Local connection check — 25 October 2026

The active Firebase project and `sales-native` database were read-only verified in this session: Enterprise/native Firestore, `asia-south1`, free-tier eligible, and currently empty. The app already has a Firebase-authenticated Worker/store implementation. Ignored local config now contains the public web-app settings and the Worker project/database target; the frontend is deliberately still in demo mode because the Worker cannot authenticate to Firestore yet. `npm run check:live` confirms the precise backend blocker: `FIREBASE_SERVICE_ACCOUNT_EMAIL` and `FIREBASE_PRIVATE_KEY` are absent. Save a dedicated service-account JSON locally as `.firebase-service-account.json`, grant only Cloud Datastore User on the dedicated project, then run `npm run configure:firebase`; keep the key local and out of chat/Git. The app can switch to live mode and run the authenticated signup → onboarding → save/read smoke test only after that credential is configured.

Outbound channels are not live: WhatsApp has no Meta token, phone-number ID, approved template or cost estimate; Vapi has no caller-number ID or cost estimate, and the assistant has not passed the disclosure/consent review; invoice email has no Resend key or verified sender. Keep their flags disabled. No calls, messages, or emails were sent during this check. Vapi API and webhook credentials in the ignored local file were exposed in an inspection output and have been removed from that file; revoke both in Vapi and replace them locally before any calling is enabled. See the provider-specific setup above and `CALLING-ACCOUNT-SETUP.md`.
