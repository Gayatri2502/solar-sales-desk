# SolarDesk automation setup

| Integration | Required configuration |
| --- | --- |
| Firebase Auth and Firestore | Enable live frontend, set API URL and allowed origin, create the business through signup, and set its ID as INTEGRATIONS_TENANT_ID. Install the server credentials on the API host. Verify sign-in and saving. |
| Vapi and carrier | Private Vapi API key, reviewed assistant ID, outbound number ID with India routing, verified cost estimate, and the voice callback at /api/hooks/voice using the shared Bearer secret. |
| Meta WhatsApp Business | Sender phone ID, access token, app secret, verification token, Graph API version, approved qualification template and cost estimate. Subscribe to /api/hooks/whatsapp for replies and delivery events. |
| Resend invoice email | API key and verified sender in INVOICE_FROM_EMAIL. Configure the delivery allowance and verify receipt after admin approval. |
| OpenAI extraction | Server API key, model, rates and allowance. Use the app's validated extraction for requirements review. |
| n8n | Reachable HTTPS SolarDesk API, imported workflow, and a shared dispatch secret. |
| Lead intake | Dashboard capture works today. Add a source-specific CRM or form integration if external leads should enter automatically. |

## Connect n8n

1. Import integrations/n8n/solar-sales-desk.json. Replace the URL in **Dispatch SolarDesk queue** with your deployed API URL, preserving /api/automation/dispatch.
2. Generate a random secret with at least 32 bytes of entropy. Set it on the API host as N8N_DISPATCH_SECRET and create an n8n Header Auth credential named Authorization with value Bearer followed by a space and the same secret. Assign the credential to the HTTP node.
3. Run manually with outbound provider flags disabled. Confirm HTTP 200, and confirm an incorrect credential gets HTTP 401. Publish the schedule after provider checks with a consented test lead. A 200 means the queue run returned. Individual delivery outcomes are tracked in SolarDesk.
4. Setting a valid dispatch secret hands scheduled communications and invoice recovery to n8n. The Worker cron still handles maintenance. Remove the secret to return scheduled dispatch to the Worker. Keep provider callbacks pointed directly at SolarDesk.

## Decision flow

- Due, consented appointments enter the voice queue when the business enables automatic calls. Queue processing uses existing allowances, scheduling rules and duplicate protection. Leads without permission stay out of the call queue.
- An answered call with a transcript updates the lead to Details captured. Staff can use AI extraction to review the transcript, promote it to an enquiry, match the catalogue and draft a quote.
- Busy, unanswered and failed calls return to Qualified for staff to arrange a new agreed appointment. Opt-outs stop further outreach.
- Staff record acceptance and convert an approved quote to an order. Invoice delivery uses the existing admin approval gate.
- Automatic transcript-to-next-action classification, automatic quote drafting, external lead intake, and automated quote or follow-up delivery need additional implementation. Silence never counts as acceptance.
