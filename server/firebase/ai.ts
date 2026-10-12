import { z } from "zod";
import { FirebaseStore, StoreError, type Member } from "./store";
import { type State, extractionSchema, localDay } from "../../src/domain";
import { extract, costMicros, type AIConfig, type AIResult } from "../provider";
export type AIEnv = {
  AI_ENABLED?: string;
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  AI_MODEL?: string;
  AI_INPUT_USD_PER_M?: string;
  AI_OUTPUT_USD_PER_M?: string;
  APP_SPEND_CEILING_USD?: string;
  USER_DAILY_AI_LIMIT?: string;
  TENANT_DAILY_AI_LIMIT?: string;
};
export type Row = {
  id: string;
  at: string;
  user: string;
  inputTokens: number;
  outputTokens: number;
  estimatedMicros: number;
  status: string;
};
type Ledger = { rows: Row[] };
type Job = {
  id: string;
  ledger: string;
  tenant: string;
  user: string;
  createdAt: string;
  status: string;
  result?: unknown;
  reserve: number;
};
const safeNumber = (value: string | undefined, fallback: number, max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .parse(value === undefined ? fallback : Number(value));
export async function reserveExtraction(
  store: FirebaseStore,
  ctx: Member,
  hash: string,
  reserve: number,
  env: AIEnv,
  now = new Date().toISOString(),
) {
  const month = now.slice(0, 7),
    jobPath = "system/ai-" + ctx.tenant + "-" + hash,
    ledgerPath = "system/usage-" + ctx.tenant + "-" + month,
    globalPath = "system/ai-budget-" + month;
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await store.get<Member>("members/" + ctx.id);
    if (!member || member.value.tenant !== ctx.tenant)
      throw Error("Business membership required.");
    const s = await store.get<State>("businesses/" + ctx.tenant);
    if (!s) throw Error("Business unavailable.");
    if (["Past due", "Cancelled"].includes(s.value.settings.subscription))
      throw Error("AI is paused for this subscription. Continue manually.");
    const old = await store.get<Job>(jobPath);
    if (old && Date.now() - Date.parse(old.value.createdAt) < 86400000) {
      if (old.value.status === "complete")
        return { cached: extractionSchema.parse(old.value.result) };
      throw Error(
        old.value.status === "pending"
          ? "Extraction already in progress. Continue manually or check later."
          : "This extraction failed or is uncertain. Continue manually.",
      );
    }
    const ledger = await store.get<Ledger>(ledgerPath),
      global = await store.get<{ reserved: number }>(globalPath),
      rows = ledger?.value.rows || [];
    const day = localDay(now, s.value.settings.timezone),
      daily = rows.filter(
        (r) => localDay(r.at, s.value.settings.timezone) === day,
      );
    if (
      rows.length >= s.value.settings.allowance ||
      rows.length >= 5000 ||
      daily.length >= safeNumber(env.TENANT_DAILY_AI_LIMIT, 100, 10000) ||
      daily.filter((r) => r.user === ctx.id).length >=
        safeNumber(env.USER_DAILY_AI_LIMIT, 20, 1000) ||
      rows.reduce((n, r) => n + r.estimatedMicros, 0) + reserve >
        s.value.settings.spendCeilingMicros ||
      (global?.value.reserved || 0) + reserve >
        safeNumber(env.APP_SPEND_CEILING_USD, 5, 10000) * 1000000
    )
      throw Error(
        "AI allowance or estimated spending ceiling reached. Continue manually.",
      );
    const id = crypto.randomUUID(),
      job: Job = {
        id,
        ledger: ledgerPath,
        tenant: ctx.tenant,
        user: ctx.id,
        createdAt: now,
        status: "pending",
        reserve,
      };
    try {
      await store.call(store.root + "/documents:commit", {
        writes: [
          {
            verify: store.name("members/" + ctx.id),
            currentDocument: { updateTime: member.stamp },
          },
          {
            verify: store.name("businesses/" + ctx.tenant),
            currentDocument: { updateTime: s.stamp },
          },
          store.write(jobPath, job, old?.stamp),
          store.write(
            ledgerPath,
            {
              rows: [
                ...rows,
                {
                  id,
                  at: now,
                  user: ctx.id,
                  inputTokens: 0,
                  outputTokens: 0,
                  estimatedMicros: reserve,
                  status: "pending",
                },
              ],
            },
            ledger?.stamp,
          ),
          store.write(
            globalPath,
            { reserved: (global?.value.reserved || 0) + reserve },
            global?.stamp,
          ),
        ],
      });
      return { path: jobPath, id };
    } catch (e) {
      if (!(e instanceof StoreError) || ![409, 412].includes(e.status)) throw e;
    }
  }
  throw Error("AI reservation conflict. Continue manually.");
}
export async function finishExtraction(
  store: FirebaseStore,
  path: string,
  id: string,
  result: AIResult | null,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const old = await store.get<Job>(path);
    if (!old || old.value.id !== id || old.value.status !== "pending")
      throw Error("Extraction reservation changed.");
    const business = await store.get<State>("businesses/" + old.value.tenant);
    if (!business) throw Error("Business was removed.");
    const ledger = await store.get<Ledger>(old.value.ledger);
    if (!ledger) throw Error("Usage ledger unavailable.");
    const rows = ledger.value.rows.map((r) =>
      r.id === id
        ? {
            ...r,
            inputTokens: result?.inputTokens || 0,
            outputTokens: result?.outputTokens || 0,
            estimatedMicros: result?.estimatedMicros ?? old.value.reserve,
            status: result ? "complete" : "failed",
          }
        : r,
    );
    try {
      await store.call(store.root + "/documents:commit", {
        writes: [
          {
            verify: store.name("businesses/" + old.value.tenant),
            currentDocument: { updateTime: business.stamp },
          },
          store.write(
            path,
            {
              ...old.value,
              status: result ? "complete" : "failed",
              result: result ? extractionSchema.parse(result.extraction) : null,
            },
            old.stamp,
          ),
          store.write(old.value.ledger, { rows }, ledger.stamp),
        ],
      });
      return;
    } catch (e) {
      if (!(e instanceof StoreError) || ![409, 412].includes(e.status)) throw e;
    }
  }
  throw Error("Usage save conflict. Continue manually.");
}
export async function firebaseExtract(
  store: FirebaseStore,
  ctx: Member,
  text: string,
  env: AIEnv,
) {
  if (env.AI_ENABLED !== "true")
    throw Error("AI is disabled. Enter requirements manually.");
  z.string().trim().min(1).max(12000).parse(text);
  const config: AIConfig = {
    provider: env.AI_PROVIDER === "mock" ? "mock" : "openai",
    key: env.OPENAI_API_KEY,
    model: env.AI_MODEL || "gpt-5.4-nano",
    inputRate: safeNumber(env.AI_INPUT_USD_PER_M, 0.2, 100),
    outputRate: safeNumber(env.AI_OUTPUT_USD_PER_M, 1.25, 1000),
    timeoutMs: 15000,
    outputTokens: 2000,
  };
  const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        config.provider + "|" + config.model + "|" + text.trim(),
      ),
    ),
    hash = Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  const reserve =
    config.provider === "mock"
      ? 0
      : costMicros(
          new TextEncoder().encode(text).length + 4000,
          config.outputTokens,
          config,
        );
  const ticket = await reserveExtraction(store, ctx, hash, reserve, env);
  if ("cached" in ticket)
    return { extraction: ticket.cached, deduplicated: true };
  try {
    const result = await extract(text, config);
    await finishExtraction(store, ticket.path!, ticket.id!, result);
    return result;
  } catch {
    await finishExtraction(store, ticket.path!, ticket.id!, null).catch(
      () => {},
    );
    throw Error("AI request or result save failed. Continue manually.");
  }
}
export async function usageRows(
  store: FirebaseStore,
  tenant: string,
  from: string,
  to: string,
  timezone = "UTC",
) {
  const start = z.iso.date().parse(from),
    end = z.iso.date().parse(to);
  if (start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000)
    throw Error("Choose a report period up to one year.");
  const months = new Set<string>();
  const d = new Date(Date.parse(start + "T00:00:00Z") - 86400000),
    endMonth = new Date(Date.parse(end + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 7);
  d.setUTCDate(1);
  while (d.toISOString().slice(0, 7) <= endMonth) {
    months.add(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const data = await Promise.all(
    [...months].map((m) =>
      store.get<Ledger>("system/usage-" + tenant + "-" + m),
    ),
  );
  return data
    .flatMap((d) => d?.value.rows || [])
    .filter(
      (r) =>
        localDay(r.at, timezone) >= start && localDay(r.at, timezone) <= end,
    );
}
