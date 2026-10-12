# Solar Sales Desk implementation

A distributor's core problem is re-entering product requests and prices across messages, quotations and order sheets, then losing track of the next action. This is a hypothesis from the brief, not validated customer research. The pilot must measure preparation time and missed follow-ups before judging willingness to pay.

## Implementation plan (implemented in this order)
1. Shared exact-decimal calculations and enquiry → catalogue selection → draft → approval → sent → follow-up → order workflow.
2. Catalogue, customers, validated CSV previews, business settings, manual subscription and pilot metrics.
3. Authenticated Cloudflare Worker, shared Supabase schema, RLS and atomic version commits; durable AI allowance reservation.
4. Unit, database, DOM and browser verification; operator documentation and pilot checklist.

## Defaults and decisions
INR only in this pilot; Asia/Kolkata default with configurable IANA timezone. Tax fields start unset. Synthetic catalogue attributes explicitly say they are unverified examples. Quantities are thousandths; currency amounts are paise; percentages are basis points. Integer BigInt intermediate multiplication with half-up rounding per line: quantity × unit price, then discount, then tax on the discounted line. Delivery has its own explicit tax configuration. Margin excludes delivery and tax; it is (net product sales − extended product cost) / net product sales. Missing cost never becomes a zero-cost assumption.

Swiss visual anchor: Helvetica/system sans, #FFFFFF/#F7F7F8 surfaces, #002FA7 action accent, grid rules, large task counts. A shallow seven-item navigation follows the requested vocabulary. Tables scroll inside their own container on phones. Modals use Radix focus management through shadcn source components.

The live DB keeps one versioned JSONB aggregate per tenant in a **shared** database. This deliberately trades SQL reporting flexibility for a small pilot with one authoritative domain reducer. Stock reservations are integer fields in that aggregate, with an atomic conditional Postgres update on revision. The Worker retries against the latest snapshot at most four times. Thus two concurrent commands cannot both commit from stale availability. Domain tests and actual Postgres semantics are tested via PGlite. This is optimistic transactional concurrency, not a browser lock. No per-customer database, Redis, queues, or agent frameworks.

Private aggregates cannot be read by sales directly via Supabase REST. RLS permits own-tenant admins to read them; no client role has write policies. Only service-role RPCs can commit. Worker derives membership from auth.getUser(access token), rejects role/tenant spoofing, applies admin permissions, and strips costs, price-list overrides and audit details before sales responses. Browser demo roles are illustrative, not an authentication boundary.

PDFs stay on the user's device, are limited to 5 MB / 25 pages, are text-extracted on demand, and are never uploaded or retained. Scanned PDFs use manual entry. No cloud storage bucket is required, so there are no stored document URLs to authorize. Enquiry text is business data retained until business deletion or an operator-agreed retention purge.

## Scope omitted deliberately
Receivables, accounting, automatic WhatsApp, payment gateway, scanned-PDF OCR, native apps, ERP integration, local model runtime, and scheduled AI are omitted. Suggested customer messages use deterministic editable templates, with no AI charges. Sending and confirming that a message was sent remain staff actions.
