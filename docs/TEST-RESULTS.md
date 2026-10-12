# Verification record — 5 October 2026

## Passed

- `npm test`: **50 tests across seven files**. Integer pricing/quantity rounding, discounts, delivery tax, missing tax/cost handling, sales/admin permissions, approved revisions, duplicate orders, reservation aggregation, dispatch/cancellation, required stock reasons, CSV duplicate/precision/quoted-cell validation, spreadsheet formula escaping, ambiguous matching and missing quantities, hosted-provider strict response validation/timeout/no retries, customer-facing document privacy, quote navigation and sales cost visibility.
- The concurrency test uses PGlite with the actual migration and Worker `mutate` retry path. Two accepted quotes compete for 20 panels: one order succeeds, one rejects after refreshing stock. Duplicate conversion rejects. Cancellation releases the reservation and retains physical stock.
- `npm run db:test`: migration executes in Postgres/PGlite; tenant A cannot read or modify tenant B; sales cannot read private aggregate state or invoke approval RPC; service-side actor membership spoofing rejects; version conflict admits one winner; durable AI request deduplication and allowance exhaustion pass.
- `npm run build`: TypeScript and Vite production compilation pass. PDF code is loaded on demand. Dependency pure-comment annotations cause benign Rollup warnings, not build failures.
- Wrangler `deploy --dry-run`: Worker bundle succeeds, no deployment. Used temporary config/log paths to respect the local sandbox. Fetch, Web Crypto and AbortController bundle for the Workers runtime. Actual edge CPU and network behavior remain staging checks.
- App-browser walkthrough: explicit synthetic tax configuration → catalogue selection → ₹249,000 quotation → admin approval → marked sent → order reservation → cancellation. Panel stock 120 physical / 20 reserved / 100 available became 120 / 0 / 120 after cancellation; inverter reservation also released.
- Current mobile dashboard checked at 251 CSS-pixel content width: document scroll width equals viewport width; wide tables scroll within their container. Laptop breakpoint also inspected. Dialog opens with focus on Customer, Escape closes it and restores focus to New enquiry after a fix. Sales catalogue hides cost and admin actions. Synthetic banner remains visible.
- Customer document rendered with React/jsdom: no internal cost/margin content. Printing stylesheet hides internal UI and prints only the customer document.

## Supplied but blocked / unverified

`npm run test:e2e` includes the complete workflow, Chromium-generated PDF, mobile keyboard/focus checks and axe checks. All three browser tests were blocked at Chromium launch by this macOS sandbox (`bootstrap_check_in` permission failure). **They did not pass.** App-browser walkthrough and rendered DOM tests supplement these checks but do not substitute for the PDF/axe suite. Run it on an unrestricted workstation or CI and inspect a printed PDF before pilot activation.

No Supabase credentials, deployed Worker or AI key was supplied. Real JWT login, admin-created Auth users/password changes, staging cross-tenant requests, deployed stock races, live restore rehearsal, actual hosted model response, account-specific model entitlement and edge CPU profiling remain operator activation checks in OPERATIONS.md and PILOT.md. No billable AI call was made.

## React Doctor review

Final scan after removing generated server bundle from source scope: **59/100, 28 warnings, no security or accessibility diagnostics**. This is not a clean bill of health or a WCAG certification. Scan output is preserved in `react-doctor.txt`.

Confirmed issues fixed: sequential independent database reads, deprecated Zod schema methods, unsafe hash decoding, authentication loading reset outside `finally`, unguarded selected revision lookup, explicit accessible names, repeated currency formatter allocation, and dialog return focus. App was split into screen components.

Remaining diagnostics reviewed:

- Complexity/large-component warnings (high confidence): App, Settings and quote editor retain substantial orchestration; refactor as the pilot evolves. No functional failure inferred from line counts.
- Derived editor state (high-confidence intentional): editing a saved quote/settings uses a local unsaved buffer; quote details are keyed by revision and only persisted deliberately. Automatically mirroring props would overwrite unsaved edits.
- Index keys (medium-confidence limited impact): fixed metric/import/print rows and fully controlled editable item rows. All business mutations use record IDs. Stable line IDs are a useful later refinement.
- PDF sequential page extraction (high-confidence intentional): bounded 25-page loop limits memory use and preserves page order.
- Lazy initializer suggestions, small bounded CSV column lookups and Fast Refresh exports (low impact): performance/maintainability improvements remain; they do not affect exact prices or tenant authorization.
- Timezone formatter warning (false positive, high confidence): constructing it on settings save validates the configured IANA timezone; it is not in a render loop.

An earlier scan included a generated **server** Worker bundle/map and flagged server environment binding names as browser-secret exposure and Supabase library internals. That artifact was moved outside the application source tree. No actual credentials existed; privileged values are read only by server code. Deployment configuration must still be checked before activation.

## Lead/call extension verification
Eight additional domain tests cover source/open-lead deduplication, WhatsApp/call permission, due-time eligibility, opt-out suppression, repeated-run protection, one enquiry per lead, quote approval/sending guards, product/service handoff, business timezone conversion and nonexistent DST appointments, quantity/specification separation, and contact-wide opt-out/number-change guards. Calls are simulated only; no external call or message was sent. The Worker explicitly rejects simulation commands in live mode. Live scheduler/provider integration remains an activation dependency, not a passing test. The React Doctor report above predates this extension.

App-browser extension walkthrough passed: Dashboard → Run due demo calls → Details captured → editable item extraction review → delivery destination/date → Create reviewed enquiry. Lead links to the created enquiry and queue does not rerun it.

## Admin reporting extension

Weekly, monthly and yearly calendar boundaries, timezone attribution, enquiry cohorts, distinct quotes/revisions, cancelled order exclusion, exact cost/margin calculations and unknown costs are tested. Call outcomes, reviewed quality coverage, expense duplicates, admin permissions and CSV contents are tested. The database check applies both migrations and verifies admin-only, tenant-bound daily AI usage totals including pending estimates. Browser walkthrough verified period switching and synthetic call/expense records. Mobile report text wraps and tables scroll locally. Native browser download capture was unavailable; generated CSV contents passed automated validation.

The reporting React Doctor scan produced maintainability warnings; its remote score service was unavailable. These are not a clean accessibility certification. See report-react-review.txt.

## Graphs and invoice delivery extension

50 tests pass. New checks cover automatic single invoice creation, sales/admin gates, approval invalidation on revision, cancelled/voided invoices, concurrent CAS delivery claims against Postgres, stale leases, bounded retries, provider malformed/rejected/timeout responses, idempotency headers, escaped HTML/private-cost exclusion, category/trend totals and sales graph privacy. UI test executes sales submission → admin approval → Demo sent. All three migrations pass DB permission, tenant-bound email reservation, deduplication, service-only queue selection and shared daily-cap checks. Production build and Wrangler dry-run pass without deployment.

App browser walkthrough produced one synthetic ₹31,800 order/invoice, pending sales submission, admin Demo sent and corresponding graphs. Narrow report document width equals viewport width; graph data/controls remain readable. Actual email delivery, bounce/receipt webhooks, real domain/provider setup and deployed scheduled invocation are unverified until credentials and activation approval. No external email was sent.

Final React Doctor review: 38 warnings, with no security/accessibility diagnostics; remote score API unavailable. Fixed new repeated graph lookups, moved graph aggregation out of the component module and removed unsafe bucket assertions. Remaining warnings concern component complexity and existing form/edit buffers; the scan is not a WCAG certification. See invoice-react-review.txt.

## Public access and communication adapters — 5 October 2026

Production client build and Cloudflare Worker dry bundle passed. Unit/UI suites cover unauthenticated dashboard protection, negotiated public plans, Meta template payload and signature validation, bounded voice creation, missing/malformed provider acceptance, business provider binding, permission/opt-out, estimated spending exhaustion, duplicate queue/claim prevention and staff-reviewed completion. SQL isolation tests apply migrations 001–004. React Doctor scan completed locally; remote score unavailable. Existing architectural/performance warnings remain, so this is not a clean certification. Public desktop/mobile layouts were checked in the in-app browser with no horizontal overflow on tested sizes.

No real Firebase connection, WhatsApp delivery, phone call, authentication email or invoice email delivery was verified in this environment. Credentials and account/number approvals remain required. Browser automation process limitations documented above still apply. See LIVE-CONNECTIONS.md for the live release gate.

12 October 2026: dependency security fixes and Vitest 5.0.4 applied; npm reports zero known vulnerabilities after the update. All 61 tests and production build passed again. Firebase project/web app, email/password provider configuration and native Firestore deployment were created; these resource checks are not a Firebase business-workflow test.

Firebase core integration, 12 October 2026: 67 automated tests passed, including signed Firebase token audience/expiry/signature/email-verification checks and REST commit fixtures for tenant/role isolation, duplicate onboarding and competing stock reservations. Client production build and Worker dry bundle passed. Runtime dependency audit found zero known vulnerabilities. These are local checks; live Firebase save/restore, provider dispatch, user administration, invoice email and hosted callback verification are not yet passed. Arka's Vapi name/configuration was verified; no call was placed.

Firebase integration completion pass: 73 tests passed, including concurrent AI deduplication, cached-schema validation, allowance exhaustion, signed WhatsApp opt-out and callback replay, one outbound claim under concurrent dispatch, admin-bound/idempotent invoice reservations, timezone month-boundary reporting, tenant-scoped deletion and restore quarantine. Production build passed. Firebase rules/index deployment succeeded (job 1791830753402); billing remains disabled. Live provider/database transactions and restoration remain pending the account configuration in PENDING.md.
