# Live setup, deployment, backups and deletion

## Required configuration
Demo is fully separate: `VITE_MODE=demo` uses browser-local synthetic storage only. Live mode never reads this storage. Do not migrate synthetic data into customer workspaces.

1. Create **one** Supabase project for all businesses, only after deployment approval. Choose a suitable region and review the current terms/data-processing agreement with the business. Apply all migrations in filename order: `supabase/migrations/001_initial.sql`, then `002_admin_reports.sql`, then `003_invoices.sql` in the SQL editor or with your migration runner.
2. Disable public signup in Supabase Auth. Operator creates the first business owner using email/password through the Supabase admin dashboard, confirms their email, and shares credentials using an approved secure channel. No SMS, paid email or email invitation is required. Supabase's default email server only sends to project team addresses and is unsuitable for production account recovery; this pilot uses admin-managed password reset and user-initiated authenticated password change. Agree that support workflow before onboarding.
3. Copy `.env.example` to `.env.local`, keeping **only** the VITE public settings in that file. Set `VITE_MODE=live`, actual Supabase URL/public anon key, and your API Worker URL. Keep service-role and AI keys out of VITE variables.
4. Put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional `OPENAI_API_KEY` in ignored `.dev.vars` for local Wrangler. For production use `wrangler secret put NAME`; do not paste secrets into Git or issue comments. Set `ALLOWED_ORIGIN` to the exact frontend origin (local development default uses localhost; adjust to 127.0.0.1 if using that origin). Worker authenticates Bearer tokens using Supabase Auth, then resolves membership. Client-supplied tenant/role are ignored.
5. Run `npm run worker` and `npm run dev` locally. The owner signs in and creates a named business on the onboarding screen. Configure taxes, contact details, terms and timezone in Settings. Add users through Settings → Business users with passwords of at least 12 characters. A user belongs to one business in this version. Operator can provision several owners; they share this database but have separate tenant records.
6. Verify tenant A and B with actual staging accounts: admin and sales should only see their own workspace; direct REST reads of tenant B return no rows; sales direct private-state reads return no rows; direct writes and privileged RPC calls with anon/authenticated keys are denied. Repeat the supplied tests and two-browser order race before the first customer operates live.

## AI activation (optional; manual workflow works without it)
The app ships with `AI_ENABLED=false` and mock provider configuration. There is **no live API key or billing activation** in the deliverable. The hosted adapter uses OpenAI Chat Completions over standard fetch, strict JSON schema, explicit `store:false`, GPT-5.4 nano as a configurable model, and no agent framework or provider SDK.

Before enabling for real data: obtain approval for the provider, data terms, budget and billing; verify the configured model appears in that account's `/v1/models` inventory and run one approved synthetic smoke test. Published model documentation lists GPT-5.4 nano and its Chat Completions support; account-specific availability has not been verified without credentials. Use `reasoning_effort=none`, at most 2,000 completion tokens and 12,000 input characters. Configurable price rates are USD per million tokens; keep them in sync with official pricing. Review the cost guide first.

Set `AI_PROVIDER=openai`, `AI_ENABLED=true`, `AI_MODEL=gpt-5.4-nano`, input rate 0.20 and output rate 1.25 (recheck on activation). Global ceiling defaults to USD 5/month, tenant ceiling defaults to USD 1/month, tenant monthly allowance 100, per-user 20/day, tenant 100/day. These are intentionally conservative and require explicit pilot configuration for larger workloads. Limits use UTC day/month; business follow-ups use business timezone. Past due/cancelled records pause AI only; staff can still enter data manually and export it.

A durable Postgres ledger reserves conservative worst-case input and output cost *before* the request. Global and tenant rows are locked while checking limits. A tenant/model/provider/content SHA-256 hash deduplicates repeated requests for 24 hours. Identical pending requests return a clear pending message. Provider request timeout is 15 seconds; automatic provider retries are **zero** to avoid duplicate billable requests. Failed/time-out attempts conservatively retain their reserved estimated cost because provider billing may still occur. Worker mutation retries are distinct: four version-conflict attempts, no extra AI requests.

No prompts are stored in the AI ledger. Cached extraction results are deleted on demand after 24 hours; configure the daily maintenance SQL below for reliable expiry even during inactivity. Provider abuse-monitoring retention may be up to 30 days under standard API controls; `store:false` does not remove that. Application spending estimates may lag provider billing and depend on configured prices. Set a provider-side budget/alert too; the app ceiling is not a guaranteed provider billing cap.

Gemini free-tier transmission is not implemented or activated. Free Gemini data terms are unsuitable for confidential customer data without a separate informed decision. There is no silent failover to another provider.

## Deploy only after approval
No service has been provisioned or deployed by this build.

- Run `npm ci`, all tests and `npm run build`.
- Cloudflare Pages static app: build command `npm run build`, output directory `dist`. Use the provided free pages.dev domain to avoid requiring a paid domain. Set public VITE live config at build time. Hash routing needs no server rewrites.
- Worker: `npx wrangler deploy` only after approval; configure secrets and origin first. Standard fetch, Web Crypto, AbortController and Supabase's HTTP client avoid Node-specific runtime assumptions. `npx wrangler deploy --dry-run --outdir work/worker-build` verifies bundling without deploying.
- `_headers` supplies CSP and security headers for static hosting. If the API uses a custom domain, add that exact domain to CSP `connect-src`. Do not allow broad arbitrary origins. Test local CSP only under a static preview with approved live connections.
- Measure Worker CPU on realistic tenant sizes. The free plan allows only 10 ms CPU/invocation; JSON aggregate processing may outgrow it before request counts do. Upgrade to Workers Standard only after approval, or keep the pilot small and archive closed work. Free services can stop or change; they are not an availability commitment.

## Backup/export and restore
Business admins can export their state in Settings; sales export customer CSV only. Exports contain private contact and pricing data. Store encrypted copies in the operator's approved location with restricted access. Do not upload them to AI or commit them. Demo JSON restores apply only to synthetic testing.

For a live tenant aggregate, use the included operator CLI with server credentials in a secure ignored env file:

```sh
node --env-file=.dev.vars scripts/backup.mjs export TENANT_UUID /secure/path/tenant.json
node --env-file=.dev.vars scripts/backup.mjs validate /secure/path/tenant.json
# Restore only into a verified staging/maintenance tenant after a current backup:
node --env-file=.dev.vars scripts/backup.mjs restore TENANT_UUID /secure/path/tenant.json --apply
```

The CLI validates product/customer schemas, quote price/quantity ranges, references and physical/reserved reconciliation; it preserves current tenant users, atomically version-checks the restore, and audits it. It restores business data, not auth passwords or membership permissions. Test restoration before the pilot. For full project disaster recovery use a secure Postgres logical backup including memberships and the separately managed auth schema, following [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups). Free plan does not provide the same managed backup promises as Pro. Avoid assuming the JSON export is a full project backup.

Run daily via an operator-controlled job or Supabase scheduled SQL (no AI or polling):

```sql
update public.ai_usage set result = null where created_at < now() - interval '24 hours' and result is not null;
```

Leave pending usage charged until the operator reconciles provider records; clearing a timeout automatically could reopen spending while a provider call is still billed. Do not store raw prompt logs. Keep non-sensitive request status and aggregate counts only. Review business enquiry/audit retention with each customer and purge according to their agreed policy.

## Deletion
Settings → Delete business data requires admin auth and typing DELETE. It cascades business state, memberships, audit and AI usage. Auth accounts remain for operator review so deleting one tenant cannot inadvertently delete an account outside the business. Operator can remove now-unassigned accounts using Supabase Auth admin tools after checking membership. Also delete exported backups according to the retention agreement and explain provider retention; database deletion does not erase downloaded exports or provider abuse records. Recoverable deletion is not implemented: export and approve before destructive deletion.

Invoice email activation, delivery recovery and restore reconciliation are documented in [INVOICES.md](INVOICES.md). Keep email disabled until the verified sender, staging workflow and activation approval are complete.

## Firebase backup, restore and deletion

Use the dedicated project's ignored service-account JSON and Node.js 24. The local operator command builds the trusted REST adapter in memory; no secrets are bundled or printed.

- `npm run firebase:data -- backup TENANT_UUID` writes a new private file under ignored `backups/`. Keep an encrypted off-machine copy under your own approved storage policy. No paid backup service is enabled.
- Before restore, enable `MAINTENANCE_MODE=true` on the Worker and locally. Stop customer work and reconcile active calls/deliveries. Use `npm run firebase:data -- restore BACKUP_FILE --confirm-restore` only with a trusted same-project/database backup and an existing verified tenant. Never run it on an untrusted customer-uploaded JSON file.
- Restore validates all ledger scopes and duplicates before writing. The business snapshot and up to 199 monthly ledgers commit atomically with version checks; a conflicting update aborts the whole restore. Requests above the conservative 8 MB application limit require operator-assisted restoration.
- The restore retains current membership grants, disables auto-calls, clears old call appointments and quarantines pending invoice delivery. Reconcile all restored ledgers against application/global provider budgets and bills; preserve conservative account reservations. Verify physical and reserved stock against the warehouse before leaving maintenance. A state snapshot is not an ERP stock feed or a provider billing record.
- Worker maintenance blocks ordinary API requests and scheduled jobs. Providers may retry blocked callbacks; reconcile their consoles before re-enabling service.
- Business deletion requires an authenticated admin and explicit DELETE confirmation. It removes access and core state, then purges private extraction caches/usage ledgers. Pending purge markers allow maintenance to finish interruptions. Authentication accounts and provider copies are handled separately and must be documented for the customer.

The key file and backups are ignored by Git. Deployment, restoration and paid upgrades remain operator-controlled.
