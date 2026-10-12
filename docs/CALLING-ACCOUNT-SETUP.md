# Calling account setup for the pilot

The operator selected Vapi or Twilio and currently has no calling account. Vapi is the voice provider adapter implemented in this repository. It needs a separately approved originating telephone/SIP connection; the customer's phone number is only the destination.

1. The operator completes account registration at https://dashboard.vapi.ai and accepts the provider agreement themselves. Do not purchase credits, enable auto-recharge, or choose a paid subscription without explicit approval.
2. Confirm India outbound capability, caller-number/carrier approval, applicable account data terms, number charges and full per-minute model/voice/transcription/telephony costs. A free US provider number is not a verified Indian business caller.
3. Import an approved Twilio or supported SIP/carrier number if appropriate. Review the current India calling requirements: https://www.twilio.com/en-us/guidelines/in/voice . Do not assume India domestic routing is supported by a foreign number.
4. Create/review a Vapi assistant using the guide in server/integrations/providers.ts. The assistant must disclose automation, respect consent/stop requests, gather requirements and leave uncertain product matching/pricing for staff.
5. Configure the end-of-call webhook and server-only credentials from LIVE-CONNECTIONS.md. The operator enters secrets locally or through Worker secrets, never in chat or a frontend VITE variable.
6. Confirm a maximum charge for one agreed test call before enabling outbound service. Start with a 180-second limit and the operator's private test recipient. Record actual provider outcome and usage; do not label provider acceptance as an answered call.
7. Test duplicate suppression, timeout/unknown acceptance, opt-out, spending cap, transcript review and quotation approval. Customer quotations and invoices still require admin approval; an agent cannot approve them.

No calling account, provider number, credits, recurring plan or live call was created in this session. Firebase setup does not supply calling or WhatsApp credentials.
