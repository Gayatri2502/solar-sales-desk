# First customer pilot

## Customer problem and value hypothesis
For a small solar distributor, a sale crosses customer messages, SKU choices, pricing approvals and stock sheets. Missing specifications and lost follow-ups are the target problems. This hypothesis comes from the brief; no customer interviews or willingness-to-pay research have been fabricated.

The value event is **an accurate approved quotation with a recorded next action**. Measure weekly enquiries reaching that event. Counter-metrics are correction rate, approval rework and stock exceptions, so faster preparation cannot hide lower quality. Manual billing only: agree a fee, user allowance, AI allowance and renewal date explicitly; the software's subscription record is not proof of payment.

## Before day one
- Interview the owner and two sales staff about the last five enquiries, where delays happened and how stock was confirmed. Ask for examples, not opinions about hypothetical features.
- Obtain a representative catalogue with verified SKU, unit, attributes, selling and cost prices. Staff verifies sample technical attributes; no compatibility claims are inferred.
- Measure baseline using at least 20 recent enquiries or a full normal week, then record Settings → Pilot baseline. Use the same definitions and business timezone during comparison. Do not set promised improvement targets before seeing the baseline.
- Agree pilot length (proposed four weeks), staff responsible for approvals, acceptable response time, retention/export rules, support contact and a manual fallback when infrastructure or AI is unavailable.
- Approve provider/data terms and spending ceiling if AI is desired; manual-only is a valid pilot. Confirm the infrastructure reliability trade-off against ₹1,000/month ceiling. No automatic paid upgrade.
- Configure business contact/address, optional GSTIN, currency, timezone, explicit product/delivery tax settings, numbering prefix, validity, terms, minimum margin and stale-stock age. Have the business verify its tax treatment.
- Create email/password users; test secure credential handoff and password reset. Disable public signup. Keep owner/admin and sales permissions separate.
- Import customers and products from templates; fix every row error, review preview, and commit. Existing stock imports are not a live ERP sync. Record inventory snapshot date and adjustment reasons.
- Verify an actual live tenant-isolation test, order race, print-to-PDF on the pilot's browser, and an encrypted backup/restore rehearsal. The repository tests do not replace staging checks.

## Staff acceptance tasks
1. Paste a synthetic enquiry, confirm missing quantities/specifications, and select catalogue products manually when ambiguous.
2. Save a quotation with reviewed prices, discounts, explicit taxes, delivery, terms and validity; check its arithmetic against an independent calculation.
3. Admin approves the saved revision, acknowledging stock/margin/missing-information warnings with a reason. Edit an approved quote and confirm it becomes a new unapproved revision.
4. Print the saved customer document; confirm there is no cost price or internal margin. Prepare/review a customer message and deliberately send it using the distributor's existing tool; only then mark sent.
5. Assign a salesperson, next action and due date. Record a contact. Confirm overdue work is visible and no message is sent automatically.
6. Convert accepted quote once. Confirm reserved/physical/available stock, reject duplicate conversion and competing oversell. Cancel a pre-dispatch order with a reason; confirm reservations release. Dispatch a separate order and confirm physical stock decreases.
7. Disable AI or exhaust its allowance; finish manually. Test scanned PDF fallback. Export business data and validate the backup.

## Measurement and decision rules
All business-date filters use the configured timezone. AI quotas use UTC and are explicitly labeled. Dashboard defines every formula.

| Metric | Definition | Counter-metric / decision |
|---|---|---|
| Median preparation time | Median elapsed minutes capture → each approval in the selected range; includes waiting, not just active editing | Product/quantity correction rate and approval rework. If faster but corrections rise, improve matching/review before expanding. |
| On-time follow-up % | Scheduled follow-ups due in range (through today) completed by their due day / all such follow-ups, including missed tasks | Customer opt-out/complaint count, collected manually. No pressure to send unwanted messages. Rescheduling does not erase old tasks. |
| Draft correction % | First drafts created in range whose enquiry has any recorded product/quantity correction / all first drafts created in range | Missing-specification rate, manually reviewed. Corrections are evidence for improving extraction, not a staff penalty. |
| Quote-to-order conversion | Sent quote revisions in range with a non-cancelled order created in range / sent revisions in range | Discounts/margin exceptions and cancellations. Describe date-window effects; not causal revenue proof. |
| Weekly active sales users | Distinct sales accounts with a recorded action in last seven days | Staff-reported task completion and duplicate entry burden. Admin activity doesn't inflate the count. |

Compare baseline and pilot cohorts with the same season/customer mix where possible. Keep a manual log of extraction/product correction examples and timeouts, without uploading customer messages to public tools. Review five real quotations weekly with the owner. Weekly target-setting follows the baseline; record any agreed target and whether confidence/sample size is sufficient.

Pilot completion is a decision, not a revenue claim: staff complete the acceptance tasks, accuracy/stock checks pass, the owner can use/export the records without developer assistance, costs are visible and acceptable, and the owner explicitly chooses whether to continue paying. Human support cost and development effort are separate from hosting. No testimonials, savings percentages or revenue increase are asserted without evidence.

Before invoice email activation: review sender/domain and invoice template/numbering with the owner; test synthetic recipient delivery only after activation approval; verify separate sales-submit/admin-approve gates, revised-recipient approval reset, duplicate claims, quota queue, timeout recovery and cancellation. Confirm provider-accepted is never presented as customer receipt/payment. Keep email disabled during restore and reconcile external delivery before resending quarantined records.
