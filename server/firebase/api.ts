import { z } from "zod";
import { FirebaseStore, firebaseIdentity, type FirebaseEnv } from "./store";
import {
  integrationStatus,
  queueContact,
  handleProviderWebhook,
  verifyWhatsAppChallenge,
  type CommunicationEnv,
} from "../integrations/service";
import { deliverInvoices, type EmailEnv } from "../invoice-delivery";
import { FirebaseBridge, firebaseMutate } from "./bridge";
import { firebaseExtract, usageRows, type AIEnv } from "./ai";
import {
  firebaseAddUser,
  firebaseResetPassword,
  verifyCurrentAccount,
} from "./users";
import { firebaseDelete, firebaseExport } from "./privacy";
import { visibleState, localDay } from "../../src/domain";
export type FirebaseAPIEnv = FirebaseEnv & CommunicationEnv & EmailEnv & AIEnv;
export async function firebaseAPI(
  req: Request,
  env: FirebaseAPIEnv,
  readBody: (req: Request) => Promise<any>,
  readRaw: (req: Request) => Promise<string>,
) {
  const path = new URL(req.url).pathname;
  try {
    const store = new FirebaseStore(env),
      db = new FirebaseBridge(store).asDatabase();
    if (path === "/api/hooks/whatsapp" && req.method === "GET")
      return verifyWhatsAppChallenge(req, env);
    if (
      ["/api/hooks/whatsapp", "/api/hooks/voice"].includes(path) &&
      req.method === "POST"
    )
      return handleProviderWebhook(
        req,
        await readRaw(req),
        env,
        db,
        firebaseMutate,
      );
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token)
      return { status: 401, data: { error: "Authentication required." } };
    let identity;
    try {
      identity = await firebaseIdentity(token, env.FIREBASE_PROJECT_ID!);
      if (!env.FIREBASE_WEB_API_KEY)
        throw Error("Account verification not configured.");
      await verifyCurrentAccount(
        store,
        token,
        env.FIREBASE_WEB_API_KEY,
        identity.id,
      );
    } catch {
      return {
        status: 401,
        data: {
          error:
            "Verified active account required. Confirm your email or sign in again.",
        },
      };
    }
    if (path === "/api/onboard" && req.method === "POST") {
      const input = z
        .strictObject({ name: z.string().min(1).max(200) })
        .parse(await readBody(req));
      return {
        status: 200,
        data: {
          tenant: await store.onboard(identity.id, identity.email, input.name),
        },
      };
    }
    const member = await store.member(identity.id);
    if (path === "/api/state" && req.method === "GET") {
      const snapshot = await store.snapshot(identity.id),
        today = localDay(
          new Date().toISOString(),
          snapshot.state.settings.timezone,
        );
      snapshot.state.usage = await usageRows(
        store,
        member.tenant,
        today.slice(0, 7) + "-01",
        today,
        snapshot.state.settings.timezone,
      );
      return {
        status: 200,
        data: { ...snapshot, state: visibleState(snapshot.state, snapshot.role) },
      };
    }
    if (path === "/api/integrations" && req.method === "GET")
      return { status: 200, data: integrationStatus(env, member.tenant) };
    if (path === "/api/contact" && req.method === "POST") {
      const c = z
        .strictObject({
          leadId: z.string().min(1),
          kind: z.enum(["WhatsApp", "Voice"]),
        })
        .parse(await readBody(req));
      await queueContact(db,member,c.leadId,c.kind,env,firebaseMutate);
      return {status:200,data:await store.snapshot(identity.id)};
    }
    if (path === "/api/command" && req.method === "POST") {
      const cmd = z
        .looseObject({ type: z.string().min(1).max(50) })
        .parse(await readBody(req));
      if (
        (cmd.type.startsWith("comms.") && cmd.type !== "comms.policy") ||
        [
          "invoice.claim",
          "invoice.complete",
          "invoice.fail",
          "invoice.demoSend",
          "lead.simulate",
          "lead.simulateDue",
        ].includes(cmd.type)
      )
        return {
          status: 403,
          data: {
            error:
              "Provider-controlled transitions cannot be submitted by clients.",
          },
        };
      let state = await store.mutate(identity.id, cmd);
      if (cmd.type === "invoice.approve") {
        await store.dispatchTenant(member.tenant);
        await deliverInvoices(
          db,
          member.tenant,
          env,
          firebaseMutate,
          String(cmd.id),
        );
        state = (await store.snapshot(identity.id)).state;
      }
      return { status: 200, data: { state } };
    }
    if (path === "/api/extract" && req.method === "POST") {
      const input = z
        .strictObject({ text: z.string().min(1).max(12000) })
        .parse(await readBody(req));
      return {
        status: 200,
        data: await firebaseExtract(store, member, input.text, env),
      };
    }
    if (member.role !== "admin")
      return { status: 403, data: { error: "Business admin required." } };
    if (path === "/api/users" && req.method === "POST")
      return {
        status: 200,
        data: await firebaseAddUser(
          store,
          member,
          await readBody(req),
          env.FIREBASE_WEB_API_KEY!,
        ),
      };
    if (path === "/api/password" && req.method === "POST")
      return {
        status: 200,
        data: await firebaseResetPassword(store, member, await readBody(req)),
      };
    if (path === "/api/export" && req.method === "GET")
      return { status: 200, data: await firebaseExport(store, member) };
    if (path === "/api/delete" && req.method === "POST") {
      const input = z
        .strictObject({ confirmation: z.literal("DELETE") })
        .parse(await readBody(req));
      return {
        status: 200,
        data: await firebaseDelete(store, member, input.confirmation),
      };
    }
    if (path === "/api/report-usage" && req.method === "POST") {
      const range = z
        .strictObject({ from: z.iso.date(), to: z.iso.date() })
        .parse(await readBody(req));
      const s = await store.snapshot(identity.id),
        rows = await usageRows(
          store,
          member.tenant,
          range.from,
          range.to,
          s.state.settings.timezone,
        );
      const days: Record<
        string,
        {
          day: string;
          requests: number;
          input_tokens: number;
          output_tokens: number;
          estimated_micros: number;
          failed: number;
        }
      > = {};
      for (const r of rows) {
        const day = localDay(r.at, s.state.settings.timezone),
          d = (days[day] ||= {
            day,
            requests: 0,
            input_tokens: 0,
            output_tokens: 0,
            estimated_micros: 0,
            failed: 0,
          });
        d.requests++;
        d.input_tokens += r.inputTokens;
        d.output_tokens += r.outputTokens;
        d.estimated_micros += r.estimatedMicros;
        d.failed += Number(r.status === "failed");
      }
      return {
        status: 200,
        data: {
          days: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
        },
      };
    }
    return { status: 404, data: { error: "Endpoint not found." } };
  } catch (e) {
    return {
      status: 400,
      data: {
        error:
          e instanceof z.ZodError
            ? "Check the fields and required values."
            : e instanceof Error
              ? e.message
              : "Request failed.",
      },
    };
  }
}
