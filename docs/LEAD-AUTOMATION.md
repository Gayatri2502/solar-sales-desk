# Lead qualification and calling extension

Monthly communications budget proposed by the owner: **₹2,000**. No provider has been purchased, connected, or enabled. This figure is a planning ceiling, not a guaranteed number of calls. Existing infrastructure expenses are detailed separately in COSTS.md; if ₹2,000 must cover the entire operation, reserve infrastructure first. Supabase Pro alone exceeds that ceiling at the planning exchange rate.

## Working now

Leads & Calls supports contact/source capture against customer records; optional source reference deduplication; WhatsApp permission evidence; recorded product/service qualification; call permission, language and customer-selected time; a due call queue; simulated conversations; staff-edited requirements and extraction review; creation of one linked enquiry. Existing catalogue matching, exact totals, admin approval, deliberate sending, follow-up, order conversion and stock reservations follow that enquiry.

New demo fixtures include a due synthetic call and a deliberately non-routable phone. Existing saved demos are not reset automatically. On a fresh browser/origin, open Leads & Calls → Run due demo calls → Review lead → review conversation requirements → Review extracted items → fill destination/date/specifications → Create reviewed enquiry → select catalogue products. Configure taxes explicitly before approval. In an older saved demo, capture a new lead after updating customer contact details, or deliberately reset synthetic data in Settings.

Customer-selected appointments use the configured business timezone rather than the browser timezone. Interest and explicit call permission are required; opting out removes the pending time and blocks subsequent calls. Simulation selects up to two due appointments atomically and marks them completed. Repeated queue runs cannot redial completed leads. Services are routed to staff: installation services have no implemented price catalogue and cannot silently become product quotations.

Synthetic calls contain fixed text, not speech or AI conversations. Real manual call notes are supported. WhatsApp qualification text can be copied only after permission is recorded; the application never sends it. Live Worker rejects simulation commands. No social platform connection, webhook ingestion, telephone dialer, speech recognition, speech synthesis, scheduled background caller, automated quotation delivery or WhatsApp gateway is connected yet.

## Live activation design

1. Approved WhatsApp Business account and templates; provider API/webhooks, authenticated signature validation and replay IDs. Capture opt-in evidence. A social/form lead's phone number alone does not authorize WhatsApp contact. Inbound customer replies update qualification, preferred language, explicit call agreement and appointment.
2. India-capable telephony provider approved by the owner, verified caller identity, vendor rates and outbound-call eligibility. Do not assume Twilio offers a domestic Indian outbound caller: its published India guideline specifies international originating numbers.
3. A server-side job scheduler and durable job table, not a browser timer. Unique lead/appointment key, atomic lease/claim, per-business concurrency, suppression check immediately before dial, provider request idempotency where supported, signed status callbacks, bounded retries, stale-job reconciliation. A staff edit/opt-out invalidates the pending job. Stop or hand off when the customer declines or requests a person.
4. A server-side voice session: disclose automated assistance, confirm permission to continue; collect requirements using the call guide; cap duration and attempts; support interruption and staff transfer. Recording/transcription retention and customer consent must be approved before storing audio. Treat all speech/transcripts as untrusted data. A validated extraction can create a reviewed enquiry, never approve prices or invent compatibility.
5. Reserve worst-case telephony + speech + language-model cost before dialing under both tenant and application ceilings. Reconcile provider callbacks and token/minute usage. Do not count missing provider usage as free. Application estimates may lag provider billing; provider-side limits/alerts are also needed.
6. Catalogue matches may draft when evidence uniquely identifies an item. Missing quantity, unit, specifications, or multiple matches go to staff. The existing quote approval/revision gate remains authoritative. A sending job must reload the approved revision and verify it has not changed; draft/superseded quotes cannot send. Only after provider integration and explicit activation may approved quotes be delivered automatically. Follow-up sending requires the same opt-out and channel-policy checks; accepted customer consent/payment is not inferred from silence.

## Capacity and budget

Capacity formula:

`floor((₹2,000 − messaging − caller-number rental − taxes/fees − infrastructure allocation − safety reserve) / (average call minutes × telephony rate + voice AI cost + extraction cost))`

All rates must come from the chosen provider quote/current price sheet. For illustration only, if the complete cost is ₹10 per completed attempt and ₹500 is reserved for other costs, capacity is 150 attempts/month. At ₹5 it is 300; at ₹15 it is 100. These are arithmetic scenarios, **not vendor prices or promised call counts**. Unanswered and retried calls may also incur charges. Optimize qualified, completed requirements rather than raw call volume.

Suggested initial activation policy, not active settings: one concurrent call per business, three-minute conversation target with a five-minute hard stop, one customer-agreed appointment, no blind automatic retries, staff-approved rescheduling, daily usage cap, and 20% budget reserve. Increase concurrency only after measuring provider limits, call quality, opt-outs and conversion. No recording by default; minimize retained transcripts.

## Activation inputs still needed

- Whether ₹2,000 covers communications only or all infrastructure; monthly expected qualified leads and conversation length.
- Required languages and operating hours, business timezone, and staff handoff destination.
- Approved WhatsApp Business/telephony accounts and rate sheet; approved caller number.
- Voice-provider data terms, model configuration, approved retention and any required consent process.
- Approval to activate external messages/calls and incur costs. Until then, manual contact and simulations remain usable.

## Official references reviewed 5 October 2026

- [WhatsApp key concepts and 24-hour customer-service window](https://www.twilio.com/docs/whatsapp/key-concepts)
- [WhatsApp opt-in and business-initiated templates](https://www.twilio.com/docs/whatsapp/api)
- [Twilio India voice guidelines](https://www.twilio.com/en-us/guidelines/in/voice)
- [WhatsApp provider/platform charges](https://www.twilio.com/en-us/whatsapp/pricing)
- [OpenAI voice latency and cost guidance](https://developers.openai.com/api/docs/guides/voice-latency-cost)

These sources inform integration planning; they are not a provider selection or legal determination. Verify the specific vendor account and current terms before activation.

## Candidate telephony price check

[Plivo's official India Voice API page](https://www.plivo.com/voice/pricing/in/) currently lists domestic outbound calls at ₹0.38/min, domestic number rental at ₹200/month, included audio streaming and 30-second billing pulses. Thus 300 three-minute calls represent ₹342 in call minutes plus ₹200 rental **before** voice AI, WhatsApp, infrastructure allocation, taxes and fees. This arithmetic does not establish eligibility, minimum commitment, language quality or complete call capacity. Obtain account-specific approval/KYC, full price sheet and data terms before selection. No account has been created.

[Exotel's business phone pricing](https://exotel.com/pricing/business-phone-system/) lists its entry package at ₹9,999 for five months, with streaming excluded and separately quoted. That upfront commitment does not fit a ₹2,000 purchase limit without separate approval. Neither provider is integrated or purchased.
