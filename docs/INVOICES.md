# Order invoices and customer email

## Working event flow

Accepted quotation → `order.create` atomically reserves stock, creates the confirmed order and exactly one **Draft** invoice with audit/events. For older orders, Orders → Create invoice backfills once. Both roles can open Invoices, edit the customer email/address/GSTIN and terms, and submit for approval. Amounts, quantities, discount, delivery and tax come from the accepted order; they are not recalculated by AI. Cost prices are never copied into invoices.

Draft → Pending approval → **admin approval** → Approved email queue → Sending → Sent (provider accepted). In demo, admin approval produces **Demo sent** and never calls an external provider. Sales cannot approve; server APIs reject client-controlled claim/complete/fail/demo-send commands. Database commit permissions add a second admin check. Changed recipient/details/terms create a draft revision and remove approval. Admin can update business details from Settings before delivery; this also resets approval. Draft/pending invoices have no send or approved-print button and show a not-issued watermark.

In live mode approval attempts email immediately when enabled; a five-minute Worker cron recovers queued invoices and stale delivery leases. Processing is bounded to ten businesses and two invoices/business per cron run. Refresh delivery status updates the UI on demand. No constant browser polling. Operator monitors queues when workload exceeds these pilot bounds.

Approval is approval **to email the reviewed invoice to the displayed recipient**. Cancellation before delivery voids the invoice in the same stock transaction. Cancellation/editing after a delivery attempt is blocked because the external result may be uncertain; issued-invoice correction/credit handling needs operator review and is outside this pilot workflow.

## Live configuration (not activated)

1. Apply migrations 001, 002 and **003_invoices.sql** in order to the same Supabase project. Keep RLS and service-only RPC grants.
2. Review the invoice format and numbering with the business before pilot use; this template has not been verified against the business's invoicing requirements. GST registration validation, official e-invoice submission, payment receipt verification and accounting exports are not implemented. No tax rates are assumed.
3. With explicit activation approval, configure a Resend account and verified sender domain. Keep its sending credential in Worker secrets `RESEND_API_KEY`, never `VITE_` or the frontend. Set `INVOICE_FROM_EMAIL` to the verified sender and `INVOICE_EMAIL_ENABLED=true` only after a synthetic staging recipient test. Review provider data terms; invoice/contact content is transmitted for email delivery. A shared verified application sender can serve all tenants with business identity in the invoice body; do not impersonate unverified customer domains.
4. Deploy only with user approval. The prepared Wrangler cron is inactive until deployed. Check a scheduled invocation, successful provider acceptance, failed delivery, queue recovery and cross-tenant routes in staging.
5. Keep paid overages/billing disabled unless separately approved. The shared DB ledger conservatively reserves at most 100 unique invoice revisions/day and 3,000/month across this app (UTC). Other emails in the provider account consume its allowance too. Exhaustion leaves approval queued for a later period. Worker/provider configuration and quota failures do not turn into “Sent”.

The official [send API](https://resend.com/docs/api-reference/emails/send-email) uses HTTPS fetch, compatible with Workers. HTML invoice content is escaped and excludes costs/margins. Email includes the invoice in its body; **PDF attachments and WhatsApp invoice sending are not implemented**. The approved document can also be printed to PDF locally.

## Duplicate and failure handling

CAS commits claim a two-minute delivery lease; concurrent workers admit one active sender. Idempotency key is tenant/invoice ID/revision and content freezes after the first attempt. Each request times out after 15 seconds. Cron retries with the same key up to three attempts and only within 23 hours of the first attempt. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Unknown outcomes after that window require reconciliation, never an automatic new key. Do not change the sender configuration while an uncertain invoice is being retried.

“Sent” means **accepted by provider**, not delivered, read, or paid. Delivery/bounce webhook tracking remains an activation enhancement. Failed/uncertain requests have a persisted status; no recipient or full provider response is printed to operational logs. Current email-enable configuration is server only; an Approved invoice awaiting configuration remains queued.

## Export, restore and deletion

Admin business export includes invoice snapshots, approval and delivery metadata. Database backups should include `invoice_email_usage` as well as tenant state. Keep email disabled for a restore rehearsal. The restore script quarantines restored Approved/Sending/Failed invoices by exhausting automated retries; reconcile the provider's records before any operator-controlled resend. A backup may predate a successful external email, so resetting delivery state or the ledger is unsafe. Do not restore across businesses. Business deletion cascades the delivery ledger; provider-side email retention/deletion must be handled separately under the chosen provider agreement.

## Cost assumptions — checked 5 October 2026

[Resend pricing](https://resend.com/pricing): Free is 3,000 emails/month with 100/day and three domains; Pro starts USD 20/month for 50,000 emails. At the planning rate ₹90/USD, Pro alone is ₹1,800/month before FX/taxes, leaving little of a ₹2,000 **communications** budget for calls. Do not enable Pro automatically.

| Scenario | Invoice assumption | Incremental email delivery cost |
|---|---|---|
| Demo | All events simulated | ₹0 |
| 3 businesses, 100 enquiries each/month | 30% convert; 90 invoices/month, below daily allowance | ₹0 within Free allowance |
| 10 businesses, 500 enquiries each/month | 30% convert; 1,500 invoices/month, below daily allowance; shared sender domain | ₹0 within Free allowance |

30% is a workload assumption, not a promised conversion. Domain ownership/registration, taxes, human review/support and existing infrastructure are separate. Daily spikes queue; exceeding allowances needs an approved upgrade. The base larger-scenario infrastructure estimate already exceeds ₹2,000. The full budget still needs reliability/call-volume tradeoffs before live activation.
