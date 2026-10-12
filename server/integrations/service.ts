import { type SupabaseClient } from "@supabase/supabase-js";
import {
  type State,
  type Command,
  type Role,
  visibleState,
} from "../../src/domain";
import { type CommunicationJob } from "../../src/communications";
import {
  sendQualification,
  startVoiceCall,
  verifyMetaSignature,
  secretEqual,
  qualificationReply,
  metaWebhookSchema,
  voiceWebhookSchema,
  IntegrationError,
} from "./providers";
export type CommunicationEnv = {
  INTEGRATIONS_TENANT_ID?: string;
  WHATSAPP_ENABLED?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_VERSION?: string;
  WHATSAPP_QUALIFICATION_TEMPLATE?: string;
  WHATSAPP_TEMPLATE_LANGUAGE?: string;
  WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR?: string;
  VOICE_ENABLED?: string;
  VAPI_ASSISTANT_REVIEWED?: string;
  VAPI_API_KEY?: string;
  VAPI_ASSISTANT_ID?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_WEBHOOK_SECRET?: string;
  VOICE_MAX_SECONDS?: string;
  VOICE_ESTIMATE_INR_PER_MINUTE_MINOR?: string;
};
type Context = { tenant: string; id: string; role: Role };
type Mutate = (
  db: SupabaseClient,
  ctx: Context,
  cmd: Command,
) => Promise<State>;
function credential(value: string | undefined) { return !!value && !/PLACEHOLDER|YOUR-|^test-/i.test(value); }
export function integrationStatus(env: CommunicationEnv, tenant: string) {
  const bound =
    !!env.INTEGRATIONS_TENANT_ID && env.INTEGRATIONS_TENANT_ID === tenant;
  return {
    bound,
    whatsapp: {
      configured:
        bound &&
        !!(
          credential(env.WHATSAPP_ACCESS_TOKEN) &&
          credential(env.WHATSAPP_APP_SECRET) &&
          credential(env.WHATSAPP_VERIFY_TOKEN) &&
          env.WHATSAPP_PHONE_NUMBER_ID &&
          env.WHATSAPP_GRAPH_VERSION &&
          env.WHATSAPP_QUALIFICATION_TEMPLATE &&
          Number(env.WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR) > 0
        ),
      enabled: bound && env.WHATSAPP_ENABLED === "true",
    },
    voice: {
      configured:
        bound &&
        !!(
          env.VAPI_ASSISTANT_REVIEWED === "true" &&
          credential(env.VAPI_API_KEY) &&
          env.VAPI_ASSISTANT_ID &&
          env.VAPI_PHONE_NUMBER_ID &&
          credential(env.VAPI_WEBHOOK_SECRET) &&
          Number(env.VOICE_ESTIMATE_INR_PER_MINUTE_MINOR) > 0
        ),
      enabled: bound && env.VOICE_ENABLED === "true",
    },
    note: "Configuration does not confirm provider approval or actual connectivity. Activation requires a verified provider account and staging checks.",
  };
}
async function state(db: SupabaseClient, tenant: string) {
  const r = await db
    .from("tenant_states")
    .select("state")
    .eq("tenant_id", tenant)
    .single();
  if (r.error || !r.data) throw Error("Integration business unavailable.");
  return r.data.state as State;
}
async function admin(db: SupabaseClient, tenant: string): Promise<Context> {
  const r = await db
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenant)
    .eq("role", "admin")
    .limit(1)
    .single();
  if (r.error || !r.data) throw Error("Integration administrator unavailable.");
  return { tenant, id: r.data.user_id, role: "admin" };
}
export async function runJob(
  db: SupabaseClient,
  ctx: Context,
  id: string,
  env: CommunicationEnv,
  mutate: Mutate,
  transport: typeof fetch = fetch,
) {
  const original = await state(db, ctx.tenant),
    job = original.communicationJobs?.find((j) => j.id === id);
  if (!job || job.status !== "Queued") return;
  const status = integrationStatus(env, ctx.tenant),
    connection = job.kind === "WhatsApp" ? status.whatsapp : status.voice;
  if (!connection.configured || !connection.enabled)
    throw Error(
      "This provider is not configured and enabled for this business.",
    );
  const claimed = await mutate(db, ctx, { type: "comms.claim", id }),
    j = claimed.communicationJobs!.find((j) => j.id === id)!;
  let providerId: string;
  try {
    providerId =
      j.kind === "WhatsApp"
        ? await sendQualification(
            j.phone,
            {
              accessToken: env.WHATSAPP_ACCESS_TOKEN!,
              phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
              graphVersion: env.WHATSAPP_GRAPH_VERSION!,
              template: env.WHATSAPP_QUALIFICATION_TEMPLATE!,
              language: env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
            },
            transport,
          )
        : await startVoiceCall(
            j.phone,
            {
              business: claimed.settings.name,
              language:
                claimed.leads?.find((l) => l.id === j.leadId)?.language ||
                "English",
            },
            {
              apiKey: env.VAPI_API_KEY!,
              assistantId: env.VAPI_ASSISTANT_ID!,
              phoneNumberId: env.VAPI_PHONE_NUMBER_ID!,
              maxSeconds: Number(env.VOICE_MAX_SECONDS || 180),
            },
            transport,
          );
  } catch (e) {
    await mutate(db, ctx, {
      type:
        e instanceof IntegrationError && e.uncertain
          ? "comms.uncertain"
          : "comms.failed",
      id,
    });
    return;
  }
  try {
    await mutate(db, ctx, { type: "comms.accepted", id, providerId });
  } catch {
    /* Persisted Starting job becomes Uncertain; never repeat a possibly accepted outbound request. */
  }
}
export async function queueContact(
  db: SupabaseClient,
  ctx: Context,
  leadId: string,
  kind: "WhatsApp" | "Voice",
  env: CommunicationEnv,
  mutate: Mutate,
) {
  const status = integrationStatus(env, ctx.tenant),
    connection = kind === "WhatsApp" ? status.whatsapp : status.voice;
  if (!connection.configured || !connection.enabled)
    throw Error(
      "This provider is not configured and enabled for this business.",
    );
  const estimate =
    kind === "WhatsApp"
      ? Number(env.WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR)
      : Math.ceil(
          (Number(env.VOICE_ESTIMATE_INR_PER_MINUTE_MINOR) *
            Number(env.VOICE_MAX_SECONDS || 180)) /
            60,
        );
  const next = await mutate(db, ctx, {
    type: "comms.queue",
    leadId,
    kind,
    estimate,
  });
  const id = next.communicationJobs![0].id;
  await runJob(db, ctx, id, env, mutate);
  return visibleState(await state(db, ctx.tenant), ctx.role);
}
export async function runScheduledCommunications(
  db: SupabaseClient,
  env: CommunicationEnv,
  mutate: Mutate,
) {
  const tenant = env.INTEGRATIONS_TENANT_ID;
  if (
    !tenant ||
    !(env.WHATSAPP_ENABLED === "true" || env.VOICE_ENABLED === "true")
  )
    return;
  const ctx = await admin(db, tenant);
  let s = await state(db, tenant);
  for (const j of (s.communicationJobs || []).filter(
    (j) =>
      j.status === "Starting" && Date.now() - Date.parse(j.startedAt) > 120000,
  ))
    await mutate(db, ctx, { type: "comms.uncertain", id: j.id });
  if (
    s.communicationPolicy?.autoCalls &&
    integrationStatus(env, tenant).voice.enabled &&
    integrationStatus(env, tenant).voice.configured
  ) {
    for (const l of (s.leads || [])
      .filter(
        (l) =>
          l.status === "Scheduled" &&
          l.callConsent &&
          Date.parse(l.scheduledAt) <= Date.now() &&
          !s.communicationJobs?.some(
            (j) => j.key === "Voice:" + l.id + ":" + l.scheduledAt,
          ),
      )
      .slice(0, 2)) {
      try {
        await queueContact(db, ctx, l.id, "Voice", env, mutate);
      } catch {
        /* Allowance, opt-out and deduplication leave work for staff. */
      }
    }
  }
  s = await state(db, tenant);
  for (const j of (s.communicationJobs || [])
    .filter((j) => j.status === "Queued")
    .slice(0, 2)) {
    try {
      await runJob(db, ctx, j.id, env, mutate);
    } catch {
      /* Configuration/permission checks prevent unsafe contact. */
    }
  }
}
export async function handleProviderWebhook(
  req: Request,
  raw: string,
  env: CommunicationEnv,
  db: SupabaseClient,
  mutate: Mutate,
) {
  const path = new URL(req.url).pathname,
    tenant = env.INTEGRATIONS_TENANT_ID;
  if (!tenant) return new Response("Integration unavailable", { status: 503 });
  if (path === "/api/hooks/whatsapp") {
    if (
      !(await verifyMetaSignature(
        raw,
        req.headers.get("x-hub-signature-256"),
        env.WHATSAPP_APP_SECRET || "",
      ))
    )
      return new Response("Webhook authentication failed", { status: 401 });
    const parsed = metaWebhookSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return new Response("Invalid webhook", { status: 400 });
    const ctx = await admin(db, tenant);
    for (const entry of parsed.data.entry)
      for (const change of entry.changes) {
        const v = change.value;
        if (v.metadata.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID)
          return new Response("Unknown sender binding", { status: 403 });
        for (const m of v.messages || []) {
          const text =
            m.text?.body ||
            m.button?.payload ||
            m.button?.text ||
            m.interactive?.button_reply?.id ||
            m.interactive?.button_reply?.title ||
            "";
          const at = new Date(Number(m.timestamp) * 1000).toISOString();
          await mutate(db, ctx, {
            type: "comms.inbound",
            message: {
              id: m.id,
              phone: "+" + m.from,
              text,
              at,
              reply: qualificationReply(text),
            },
          });
        }
        for (const receipt of v.statuses || []) {
          const s = await state(db, tenant),
            j = s.communicationJobs?.find(
              (j) => j.kind === "WhatsApp" && j.providerId === receipt.id,
            );
          if (j)
            await mutate(db, ctx, {
              type: "comms.receipt",
              id: j.id,
              receipt: receipt.status,
            });
        }
      }
    return new Response("OK");
  }
  if (path === "/api/hooks/voice") {
    if (
      !secretEqual(
        req.headers.get("Authorization") || "",
        `Bearer ${env.VAPI_WEBHOOK_SECRET || ""}`,
      ) ||
      !env.VAPI_WEBHOOK_SECRET
    )
      return new Response("Webhook authentication failed", { status: 401 });
    const parsed = voiceWebhookSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return new Response("Invalid webhook", { status: 400 });
    const m = parsed.data.message;
    if (m.type !== "end-of-call-report") return new Response("Ignored");
    if (
      m.call.phoneNumberId &&
      m.call.phoneNumberId !== env.VAPI_PHONE_NUMBER_ID
    )
      return new Response("Unknown caller binding", { status: 403 });
    const ctx = await admin(db, tenant),
      s = await state(db, tenant),
      j = s.communicationJobs?.find(
        (j) => j.kind === "Voice" && j.providerId === m.call.id,
      );
    if (!j) return new Response("Call not yet reconciled", { status: 409 });
    if (j.status === "Completed") return new Response("Duplicate ignored");
    const reason = m.endedReason || "",
      transcript = m.artifact?.transcript || "";
    const start = m.startedAt || m.call.startedAt,
      end = m.endedAt || m.call.endedAt;
    const duration = Math.min(
      36000,
      Math.max(
        0,
        Math.round(
          m.durationSeconds ??
            (start && end ? (Date.parse(end) - Date.parse(start)) / 1000 : 0),
        ),
      ),
    );
    const outcome = /busy/.test(reason)
      ? "Busy"
      : /did-not-answer|no-answer|voicemail/.test(reason)
        ? "Unanswered"
        : /error|failed/.test(reason)
          ? "Failed"
          : duration > 0 && transcript
            ? "Answered"
            : "Failed";
    await mutate(db, ctx, {
      type: "comms.callCompleted",
      id: j.id,
      result: {
        providerId: m.call.id,
        outcome,
        duration,
        transcript,
        at: end || new Date().toISOString(),
      },
    });
    return new Response("OK");
  }
  return new Response("Not found", { status: 404 });
}
export function verifyWhatsAppChallenge(req: Request, env: CommunicationEnv) {
  const u = new URL(req.url);
  if (
    u.searchParams.get("hub.mode") === "subscribe" &&
    secretEqual(
      u.searchParams.get("hub.verify_token") || "",
      env.WHATSAPP_VERIFY_TOKEN || "",
    )
  )
    return new Response(u.searchParams.get("hub.challenge") || "", {
      headers: { "Content-Type": "text/plain" },
    });
  return new Response("Webhook verification failed", { status: 403 });
}
