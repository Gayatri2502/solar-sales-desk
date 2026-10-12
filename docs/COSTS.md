# Operating cost estimate

Reviewed 5 October 2026. These are planning estimates, not a ₹0 guarantee or a billing quote. INR conversions use a **hypothetical ₹90/USD budget rate**, not a claimed current exchange rate. Taxes, FX/card fees, development and human support are additional. No paid service has been enabled.

## Official service facts and commercial-use review

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): Free 100,000 requests/day and 10 ms CPU/invocation; Standard starts at USD 5/month with included request/CPU allowances. [Pages static hosting](https://developers.cloudflare.com/pages/functions/pricing/) serves static assets free; API calls count as Workers usage. The [self-serve agreement](https://www.cloudflare.com/terms/) provides free-service conditions and termination discretion. This app does not collect card numbers (free-service agreement restriction). We found no general personal-use-only requirement for this app's static/Worker usage; the operator must accept the actual account agreement.
- [Supabase pricing](https://supabase.com/pricing): Free 500 MB database, 1 GB object storage, 5 GB uncached egress and 50,000 MAU; Pro starts at USD 25/month with one project included, larger allowances and managed daily backups. All tenants use one project. [Terms](https://supabase.com/terms) govern use; no general personal-use-only limitation was found for the proposed distributor app. Free projects can pause with inactivity; capacity is an allowance, not a production SLA.
- [GPT-5.4 nano model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-nano.md): model ID/snapshot and Chat Completions/structured output support; published USD 0.20/M input and 1.25/M output. HTML extraction displayed a generic deprecated label also on multiple model pages; the official Markdown model specification lists the model and default snapshot without a deprecation notice. Verify account inventory and the [deprecations page](https://developers.openai.com/api/docs/deprecations) before activation. No live account access was tested. [OpenAI services agreement](https://openai.com/policies/services-agreement/) governs customer applications; [API data controls](https://developers.openai.com/api/docs/guides/your-data) say API data is not used for training by default, with standard abuse-monitoring retention up to 30 days. Business must approve those terms.
- [Supabase built-in SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp): team addresses only, currently 2 messages/hour, not intended for production. **No required email-delivery component is hidden in this estimate**: admin-created confirmed users, secure manual password handoff, authenticated self-change and admin reset avoid email delivery. Customer messages are downloaded/copied and sent through the distributor's existing tools. If self-service recovery/invitations become required, add a separately reviewed SMTP service/domain cost before enabling them.
- [Gemini pricing/data treatment](https://ai.google.dev/gemini-api/docs/pricing): unpaid service data may be used to improve products; no Gemini integration is activated. Synthetic demo parsing is local, not a Gemini free-tier API call.

## Workload assumptions

One hosted extraction per enquiry, no automatic follow-up generation calls. Average billed input 2,000 tokens and output 800 tokens (including any billed model overhead); USD 0.0014 per extraction. Duplicate requests within 24 hours are cached. No uploaded PDFs retained; 0 GB document object storage. Customer messages manually sent; 0 paid messaging/SMS/email API calls. Existing internet and staff messaging accounts excluded as distributor overhead.

Assume fewer than 100k Worker calls/day, database remains within its selected allowance, and no paid custom domain. Estimate metadata growth, not just users: at 5,000 enquiries/month, text, quote revisions and aggregate audit history can exceed Free capacity/CPU within months. No claim is made that 10 businesses fit Free indefinitely.

| Component / month | Synthetic demo | 3 businesses × 5 users × 100 enquiries | 10 businesses × 5 users × 500 enquiries |
|---|---:|---:|---:|
| Pages static hosting | ₹0 within allowance | ₹0 within allowance | ₹0 within allowance |
| Worker API | ₹0 (not used locally) | ₹0 if CPU fits; ₹450 if Standard required | ₹450 proposed Standard |
| Shared Supabase Postgres + Auth | ₹0 (not used locally) | ₹0 allowance-based; ₹2,250 Pro option | ₹2,250 proposed Pro |
| Hosted AI | ₹0 local mock | ₹37.80 (300 × $0.0014) | ₹630 (5,000 × $0.0014) |
| Document object storage | ₹0 (no stored documents) | ₹0 (none) | ₹0 (none) |
| Messaging / auth email | ₹0 (manual) | ₹0 (manual) | ₹0 (manual) |
| **Proposed total** | **₹0** | **₹37.80–₹487.80 allowance-based** | **₹3,330** |
| With Pro database for 3-business reliability | — | **₹2,287.80–₹2,737.80** | included above |

The ₹1,000 pilot ceiling is plausible only while database Free allowances and manual operations are acceptable. A Pro database alone exceeds that ceiling at the planning FX rate. Discuss reliability and budget with the pilot customer before selling a service commitment. Development and human onboarding/support are not infrastructure and are not included; price them separately.

## Worst-case AI and upgrade triggers

Maximum permitted input is conservatively reserved as 13,000 tokens (12,000 characters plus system/schema allowance), output 2,000. At published rates this is up to $0.0051/call: ₹137.70 for 300 or ₹2,295 for 5,000. Failed attempts retain this conservative reservation. Provider usage can differ and prices can change; application spending estimates can lag billing. ₹630 is an average-workload estimate, not the maximum.

Configure the default 100 tenant requests/month to at least 500 for the larger scenario only after approval; configure the global USD 5 ceiling to the approved budget too, or extraction will stop and staff will use manual entry. Never silently remove ceilings. No unlimited/free-use plan is advertised.

Upgrade/rework when Worker CPU nears 10 ms, database approaches 400 MB, egress nears 4 GB, snapshots exceed 1 MB, restore duration or response latency is unacceptable, managed backups/availability are required, or provider limits are reached. Aggregate JSON is appropriate for a small pilot; normalize and paginate business tables before long-lived high-volume operation. Load-test the 10-business scenario before selling it. Paid upgrades require explicit owner approval.

## Optional approved invoice email

See [INVOICES.md](INVOICES.md): Resend Free can cover 90 or 1,500 assumed invoices/month if the shared 100/day limit and domains allowance permit. Registration of a sender domain is separate. Paid Pro adds $20/month (planning ₹1,800 before FX/taxes) and requires approval; no upgrade/overage is enabled. Existing “manual messaging” rows describe the base workflow before invoice email activation.

## Proposed automated calling (checked 5 October 2026)

Vapi currently lists usage-only hosting at $0.05/minute, plus model, transcription, voice and carrier costs. Its published 1,000-minute calculator shows $82–129 before an external Indian carrier/number, taxes or support. At a planning assumption of ₹90/USD (not a verified exchange rate), this is ₹7.38–11.61/minute. ₹2,000 devoted entirely to these voice charges buys approximately 172–271 minutes, or about 57–90 three-minute conversations, before carrier/number fees and other application expenses. Unanswered attempts and provider rounding may also consume charges. Actual prices depend on the selected voice/model/carrier. Do not promise a call count or an all-inclusive ₹2,000 production budget until account quotes are known.

At one three-minute call per enquiry, 3 businesses × 100 enquiries need 900 minutes: approximately ₹6,642–10,449 in these voice charges alone. 10 businesses × 500 enquiries need 15,000 minutes: approximately ₹110,700–174,150 before telephony, WhatsApp, hosting, database, email and taxes. These are added to the existing infrastructure/AI estimate, not replacement totals. Call only qualified appointments to control spending. Subscription revenue and development/human support are separate.

WhatsApp template/recipient-country charges and approved Indian number/carrier rates are pending the actual accounts; no zero-cost assumption is made. Firebase Spark has no-cost allowances, but a Firebase replacement is not yet implemented or activated; backups and services requiring Blaze need separate cost approval. See [official Vapi pricing](https://vapi.ai/pricing) and [official Firebase pricing](https://firebase.google.com/pricing). Application estimates may lag bills; prepaid provider limits should also be configured.

## Firebase backend sizing update

The dedicated native Enterprise database has free-tier eligibility with billing disabled. Enterprise measures reads in 4 KiB units and writes in 1 KiB units, so a growing JSON business aggregate consumes more allowance per operation. Free infrastructure is conditional on staying inside the actual account's quotas; exceeding Spark limits can interrupt requests rather than silently upgrade billing.

Illustrative workload (not a bill or guaranteed ceiling): at 100 KiB average state and eight state commits per enquiry, 3 × 100 enquiries/month produce about 80 commits/day, or roughly 8,000 write units/day before indexes, memberships, ledgers and other work. At 500 KiB state the same workload is about 40,000 units/day before those additions, reaching the published Enterprise write allowance. Ten businesses × 500 enquiries/month produce about 1,333 commits/day; even at 100 KiB, roughly 133,300 units/day exceeds that allowance. Normalize the database and/or obtain an approved paid quote before that scale. Read traffic, indexed queries and growing transcripts must also be measured.

Cloudflare Worker CPU limits and daily requests must be checked with real staging payloads; a successful dry bundle is not a CPU benchmark. Email, WhatsApp, carrier/number and voice charges remain separate. ₹2,000 cannot be promised for large automated-call volumes. Development and human support are excluded from infrastructure figures.

Sources: https://firebase.google.com/docs/firestore/enterprise/pricing and https://firebase.google.com/docs/projects/billing/firebase-pricing-plans . Verify region/account rates again before any paid activation.
