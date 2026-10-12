import { firebaseScheduled } from "./firebase/dispatch";
import { firebaseAPI } from "./firebase/api";
import { type FirebaseEnv } from "./firebase/store";
import {
  queueContact,
  runScheduledCommunications,
  handleProviderWebhook,
  verifyWhatsAppChallenge,
  integrationStatus,
  type CommunicationEnv,
} from "./integrations/service";
import { deliverInvoices, type EmailEnv } from "./invoice-delivery";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  reduce,
  visibleState,
  type State,
  type Role,
  type Command,
} from "../src/domain";
import { emptyState } from "../src/seed";
import { extract, costMicros, type AIConfig } from "./provider";
export type Env = FirebaseEnv & { DATABASE_PROVIDER?: string; MAINTENANCE_MODE?: string } & EmailEnv &
  CommunicationEnv & {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    ALLOWED_ORIGIN: string;
    AI_PROVIDER?: string;
    OPENAI_API_KEY?: string;
    AI_MODEL?: string;
    AI_INPUT_USD_PER_M?: string;
    AI_OUTPUT_USD_PER_M?: string;
    AI_ENABLED?: string;
    APP_SPEND_CEILING_USD?: string;
    USER_DAILY_AI_LIMIT?: string;
    TENANT_DAILY_AI_LIMIT?: string;
  };
export async function context(token: string, db: SupabaseClient) {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Error("Authentication required.");
  if (!data.user.email_confirmed_at)
    throw Error("Confirm your email before accessing business data.");
  const membership = await db
    .from("memberships")
    .select("tenant_id,role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (membership.error || !membership.data)
    throw Error("Business membership required.");
  return {
    id: data.user.id,
    role: membership.data.role as Role,
    tenant: membership.data.tenant_id as string,
  };
}
async function readState(db: SupabaseClient, tenant: string) {
  const { data, error } = await db
    .from("tenant_states")
    .select("state,revision")
    .eq("tenant_id", tenant)
    .single();
  if (error || !data) throw Error("Business data unavailable.");
  return { state: data.state as State, revision: data.revision as number };
}
export async function mutate(
  db: SupabaseClient,
  ctx: { tenant: string; id: string; role: Role },
  cmd: Command,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snapshot = await readState(db, ctx.tenant);
    const next = reduce(snapshot.state, cmd, ctx);
    const { data, error } = await db.rpc("commit_state", {
      p_tenant: ctx.tenant,
      p_user: ctx.id,
      p_revision: snapshot.revision,
      p_state: next,
      p_action: cmd.type,
    });
    if (error) throw Error("Save failed. Refresh before retrying.");
    if (data) return next;
  }
  throw Error("Another user changed this business. Refresh and retry.");
}
function json(data: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    },
  });
}
async function rawBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Request body required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1500000) {
      await reader.cancel();
      throw Error("Request exceeds 1.5 MB.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(joined);
}
async function body(req: Request) {
  return JSON.parse(await rawBody(req));
}
export default {
  async scheduled(_controller: unknown, env: Env) {
    if(env.MAINTENANCE_MODE==='true')return;
    if (env.DATABASE_PROVIDER === "firebase") {
      await firebaseScheduled(env);
      return;
    }
    if (
      env.INVOICE_EMAIL_ENABLED !== "true" &&
      env.WHATSAPP_ENABLED !== "true" &&
      env.VOICE_ENABLED !== "true"
    )
      return;
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      await runScheduledCommunications(db, env, mutate);
    } catch {
      /* A communication failure must not stop approved invoice delivery. */
    }
    const records =
      env.INVOICE_EMAIL_ENABLED === "true"
        ? await db.rpc("invoice_delivery_tenants")
        : { data: [] };
    for (const row of records.data || [])
      await deliverInvoices(db, row.tenant_id, env, mutate);
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN;
    if(env.MAINTENANCE_MODE==='true')return json({error:'Business maintenance in progress. Retry later.'},503,origin);

    if (req.headers.get("Origin") && req.headers.get("Origin") !== origin)
      return json({ error: "Origin not allowed." }, 403, origin);
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          Vary: "Origin",
        },
      });
    const path = new URL(req.url).pathname;
    if (req.method !== "GET" && req.method !== "POST")
      return json({ error: "Method not allowed." }, 405, origin);
    if (env.DATABASE_PROVIDER === "firebase") {
      const result = await firebaseAPI(req, env, body, rawBody);
      return result instanceof Response
        ? result
        : json(result.data, result.status, origin);
    }
    if (path === "/api/hooks/whatsapp" && req.method === "GET")
      return verifyWhatsAppChallenge(req, env);
    if (
      ["/api/hooks/whatsapp", "/api/hooks/voice"].includes(path) &&
      req.method === "POST"
    ) {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      try {
        return await handleProviderWebhook(
          req,
          await rawBody(req),
          env,
          db,
          mutate,
        );
      } catch {
        return new Response("Webhook could not be processed", { status: 400 });
      }
    }
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "Authentication required." }, 401, origin);
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      const { data: userData, error: authError } = await db.auth.getUser(token);
      if (authError || !userData.user)
        return json({ error: "Authentication required." }, 401, origin);
      if (!userData.user.email_confirmed_at)
        return json(
          { error: "Confirm your email before accessing business data." },
          403,
          origin,
        );
      if (path === "/api/onboard" && req.method === "POST") {
        const membership = await db
          .from("memberships")
          .select("tenant_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (membership.data)
          throw Error("Your account already belongs to a business.");
        const input = z
          .object({ name: z.string().min(1).max(200) })
          .parse(await body(req));
        const state = emptyState();
        state.settings.name = input.name;
        state.users = [
          {
            id: userData.user.id,
            name: userData.user.email || "Admin",
            role: "admin",
          },
        ];
        const { data, error } = await db.rpc("onboard_business", {
          p_user: userData.user.id,
          p_name: input.name,
          p_state: state,
        });
        if (error) throw Error("Could not create business.");
        return json({ tenant: data }, 200, origin);
      }
      const ctx = await context(token, db);
      if (path === "/api/integrations" && req.method === "GET")
        return json(integrationStatus(env, ctx.tenant), 200, origin);
      if (path === "/api/contact" && req.method === "POST") {
        const c = z
          .strictObject({
            leadId: z.string().min(1),
            kind: z.enum(["WhatsApp", "Voice"]),
          })
          .parse(await body(req));
        return json(
          { state: await queueContact(db, ctx, c.leadId, c.kind, env, mutate) },
          200,
          origin,
        );
      }
      if (path === "/api/state" && req.method === "GET") {
        const [snapshot, members, ledger] = await Promise.all([
          readState(db, ctx.tenant),
          db
            .from("memberships")
            .select("user_id,name,role")
            .eq("tenant_id", ctx.tenant),
          db
            .from("ai_usage")
            .select(
              "id,created_at,user_id,input_tokens,output_tokens,estimated_micros,status",
            )
            .eq("tenant_id", ctx.tenant)
            .gte("created_at", new Date().toISOString().slice(0, 7) + "-01")
            .order("created_at", { ascending: true }),
        ]);
        if (members.error || ledger.error)
          throw Error("Business records unavailable.");
        snapshot.state.users = (members.data || []).map((m) => ({
          id: m.user_id,
          name: m.name,
          role: m.role as Role,
        }));
        snapshot.state.usage = (ledger.data || []).map((u) => ({
          id: u.id,
          at: u.created_at,
          user: u.user_id,
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          estimatedMicros: u.estimated_micros,
          status: u.status,
        }));
        return json(
          { state: visibleState(snapshot.state, ctx.role), role: ctx.role },
          200,
          origin,
        );
      }
      if (path === "/api/report-usage" && req.method === "POST") {
        if (ctx.role !== "admin")
          return json({ error: "Business admin required." }, 403, origin);
        const dates = z
          .strictObject({
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .parse(await body(req));
        const result = await db.rpc("report_ai_usage", {
          p_tenant: ctx.tenant,
          p_actor: ctx.id,
          p_from: dates.from,
          p_to: dates.to,
        });
        if (result.error)
          throw Error(
            "Report usage unavailable. Check the date range and reporting migration.",
          );
        return json({ days: result.data }, 200, origin);
      }
      if (path === "/api/command" && req.method === "POST") {
        const cmd = z
          .looseObject({ type: z.string().max(50) })
          .parse(await body(req));
        if (cmd.type.startsWith("comms.") && cmd.type !== "comms.policy")
          return json(
            {
              error:
                "Provider events and outbound reservations are server controlled.",
            },
            403,
            origin,
          );
        if (
          [
            "invoice.claim",
            "invoice.complete",
            "invoice.fail",
            "invoice.demoSend",
          ].includes(cmd.type)
        )
          return json(
            { error: "Invoice delivery transitions are server controlled." },
            403,
            origin,
          );
        if (["lead.simulate", "lead.simulateDue"].includes(cmd.type))
          return json(
            {
              error:
                "Simulated calls are only available in synthetic demo mode. Live calling is not connected.",
            },
            403,
            origin,
          );
        let next = await mutate(db, ctx, cmd);
        if (cmd.type === "invoice.approve") {
          await deliverInvoices(db, ctx.tenant, env, mutate, String(cmd.id));
          next = (await readState(db, ctx.tenant)).state;
        }
        return json({ state: visibleState(next, ctx.role) }, 200, origin);
      }
      if (path === "/api/users" && req.method === "POST") {
        if (ctx.role !== "admin")
          return json({ error: "Business admin required." }, 403, origin);
        const input = z
          .object({
            email: z.email(),
            password: z.string().min(12).max(100),
            name: z.string().min(1).max(100),
            role: z.enum(["admin", "sales"]),
          })
          .parse(await body(req));
        const snapshot = await readState(db, ctx.tenant);
        const { count } = await db
          .from("memberships")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenant);
        if ((count || 0) >= snapshot.state.settings.userLimit)
          throw Error(
            "User allowance reached. Ask the operator to review your plan.",
          );
        const { data, error } = await db.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
        });
        if (error || !data.user)
          throw Error(
            "Could not create user. The email may already have an account.",
          );
        const { error: addError } = await db.rpc("add_business_user", {
          p_tenant: ctx.tenant,
          p_actor: ctx.id,
          p_user: data.user.id,
          p_name: input.name,
          p_role: input.role,
        });
        if (addError) {
          await db.auth.admin.deleteUser(data.user.id);
          throw Error("Could not add user; allowance may have changed.");
        }
        return json({ user: data.user.id }, 200, origin);
      }
      if (path === "/api/password" && req.method === "POST") {
        if (ctx.role !== "admin")
          return json({ error: "Business admin required." }, 403, origin);
        const input = z
          .object({ userId: z.uuid(), password: z.string().min(12).max(100) })
          .parse(await body(req));
        const { data } = await db
          .from("memberships")
          .select("user_id")
          .eq("user_id", input.userId)
          .eq("tenant_id", ctx.tenant)
          .single();
        if (!data) throw Error("User not found in this business.");
        const result = await db.auth.admin.updateUserById(input.userId, {
          password: input.password,
        });
        if (result.error) throw Error("Password update failed.");
        await db.from("security_audit").insert({
          tenant_id: ctx.tenant,
          user_id: ctx.id,
          action: "password.reset",
          detail: input.userId,
        });
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/delete" && req.method === "POST") {
        if (ctx.role !== "admin")
          return json({ error: "Business admin required." }, 403, origin);
        if ((await body(req)).confirmation !== "DELETE")
          throw Error("Explicit deletion confirmation required.");
        const { error } = await db
          .from("businesses")
          .delete()
          .eq("id", ctx.tenant);
        if (error) throw Error("Deletion failed.");
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/extract" && req.method === "POST") {
        if (env.AI_ENABLED !== "true")
          throw Error("AI is disabled. Enter requirements manually.");
        const { text } = z
          .object({ text: z.string().min(1).max(12000) })
          .parse(await body(req));
        const config: AIConfig = {
          provider: env.AI_PROVIDER === "mock" ? "mock" : "openai",
          key: env.OPENAI_API_KEY,
          model: env.AI_MODEL || "gpt-5.4-nano",
          inputRate: Number(env.AI_INPUT_USD_PER_M || "0.20"),
          outputRate: Number(env.AI_OUTPUT_USD_PER_M || "1.25"),
          timeoutMs: 15000,
          outputTokens: 2000,
        };
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            config.model + "|" + config.provider + "|" + text.trim(),
          ),
        );
        const hash = Array.from(new Uint8Array(digest))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        const reserve =
          config.provider === "mock"
            ? 0
            : costMicros(text.length + 1000, config.outputTokens, config);
        const { data: ticket, error: reserveError } = await db.rpc(
          "reserve_ai",
          {
            p_tenant: ctx.tenant,
            p_user: ctx.id,
            p_hash: hash,
            p_reserve: reserve,
            p_app_ceiling: Math.round(
              Number(env.APP_SPEND_CEILING_USD || "5") * 1000000,
            ),
            p_user_daily: Number(env.USER_DAILY_AI_LIMIT || "20"),
            p_tenant_daily: Number(env.TENANT_DAILY_AI_LIMIT || "100"),
          },
        );
        if (reserveError)
          throw Error(
            "AI allowance or spending ceiling reached. Enter requirements manually.",
          );
        if (ticket.cached)
          return json(
            { extraction: ticket.cached, deduplicated: true },
            200,
            origin,
          );
        if (ticket.pending)
          throw Error(
            "This extraction is already in progress. Retry shortly or enter manually.",
          );
        try {
          const result = await extract(text, config);
          const { error } = await db.rpc("finish_ai", {
            p_id: ticket.id,
            p_result: result.extraction,
            p_input: result.inputTokens,
            p_output: result.outputTokens,
            p_cost: result.estimatedMicros,
            p_status: "complete",
          });
          if (error)
            throw Error(
              "AI result could not be saved safely. Use manual entry.",
            );
          return json(result, 200, origin);
        } catch (e) {
          await db.rpc("finish_ai", {
            p_id: ticket.id,
            p_result: null,
            p_input: 0,
            p_output: 0,
            p_cost: reserve,
            p_status: "failed",
          });
          throw e;
        }
      }
      return json({ error: "Endpoint not found." }, 404, origin);
    } catch (e) {
      const msg = (e as Error).message;
      return json(
        {
          error:
            e instanceof z.ZodError
              ? "Check the fields and required values."
              : msg,
        },
        400,
        origin,
      );
    }
  },
};
