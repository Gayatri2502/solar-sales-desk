# Call-to-order verification — 24 October 2026

## Current live result

Arka exists in the Vapi account and the configured private key authenticated successfully during a read-only inspection. The account returned zero phone numbers. Arka has a 180-second maximum duration and no assistant server callback URL configured. The local configuration has voice disabled and assistant review disabled; caller number, webhook secret, business binding and estimated per-minute cost are missing. Live frontend/database configuration is absent. No real call was placed.

Real customer calling and call-result ingestion are therefore not operational. Provider authentication alone does not prove calling capability, India routing, conversation quality or customer conversion.

## Verified local workflow

The new call-to-order integration test uses a mocked Vapi transport and the local Firebase REST transaction fixture. It verifies:

1. A qualified product lead with explicit automated-call consent and a due appointment can queue a call within configured limits.
2. Competing dispatches submit only one provider request.
3. A callback with the wrong secret is rejected.
4. The authenticated end-of-call callback captures requirements and creates one call record; replay does not duplicate it.
5. Transcript arrival creates neither a quotation nor an order automatically.
6. Staff review converts the lead to an enquiry and selects a real catalogue product for a draft quote.
7. Sales cannot approve the quotation; an unapproved quotation cannot become an order.
8. After admin approval and recorded sharing, staff can record acceptance by creating one order and draft invoice. Repeated conversion attempts do not duplicate orders.

Lead status “Converted” means converted to an enquiry, not a completed sale. The test uses deterministic mock extraction and synthetic tax settings; it is not a test of real speech recognition, AI interpretation, technical compatibility or customer willingness to purchase.

## Remaining live test

Connect an approved India-capable caller number, deploy the authenticated callback endpoint and configure it in Vapi, set the business binding/webhook secret/rates, connect live Firebase, review the assistant, and enable a small agreed test allowance. Then call one consenting test recipient and verify audio, language, transcript, missing specifications, callback delivery, approval gates and actual provider charges. Do not infer sales success from an answered call.
