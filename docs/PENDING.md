# Remaining release tasks

## Needs operator/account access

- Firebase MFA and dedicated server credential; payment verification is not required for the current no-cost setup.
- Actual frontend web configuration, allowed origin and hosting domain selection.
- Approved India-capable caller number/carrier and confirmed rates. Arka exists in Vapi but no phone number is connected. Rotate the Vapi key that was pasted into a conversation comment, saving the replacement only locally/server-side.
- WhatsApp Business phone/account credentials, approved qualification template, permission wording and rates.
- Verified invoice email sender/provider credentials; actual authentication email-delivery verification.
- AI provider credential/model/data-terms and price verification before activation; manual entry works without it.
- Actual business/operator/support details, subscription fees/limits, renewal/cancellation terms and privacy/retention review.

## Needs hosted verification or customer data

- Real Firebase onboarding, membership/role checks and simultaneous stock transactions.
- Signed provider callbacks, one consenting test call, template delivery and approved invoice email; timeout/unknown outcomes and exhausted allowances.
- A trusted backup/restore/deletion rehearsal; warehouse/provider-billing reconciliation.
- Keyboard/mobile/browser print checks on the target deployed build.
- Pilot baseline and actual measurements: quotation time, timely follow-up, correction rate, conversion and weekly active sales users.

## Needs final authorization

- Public website/API deployment and any paid upgrade, number purchase, subscription, auto-recharge or billing activation.

## Implementation checks completed

Firebase routes, callback bridge, cron dispatcher, approved invoice send, AI ledger/deduplication, timezone reports, user administration, private export/deletion and backup/restore commands are implemented. Local test/build evidence is documented separately; it is not a substitute for the hosted checks above. Initial calling/WhatsApp provisioning remains one account bound to one pilot business. Larger workloads require normalized/paginated storage before the 750 KB aggregate guard or free quotas are reached.
