import { firebaseAuth } from "./firebase-auth";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  type State,
  type Command,
  type Role,
  reduce,
  visibleState,
} from "./domain";
import { emptyState } from "./seed";
const env = import.meta.env;
export const live = env.VITE_MODE === "live";
export const auth =
  live &&
  env.VITE_AUTH_PROVIDER === "firebase" &&
  env.VITE_FIREBASE_API_KEY &&
  env.VITE_FIREBASE_PROJECT_ID
    ? firebaseAuth({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      })
    : live && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
      ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
      : null;
const storageKey = "ssd.local-preview.v2";
export function loadDemo(): State {
  try {
    const data = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (data?.version === 1) return data;
  } catch {
    /* corrupt demo storage resets */
  }
  return emptyState();
}
export async function request(path: string, body?: unknown) {
  const session = (await auth?.auth.getSession())?.data.session;
  const r = await fetch(`${env.VITE_API_URL || ""}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(data.error || "Request failed. Retry or use manual entry.");
  return data;
}
export async function command(
  state: State,
  cmd: Command,
  actor: { id: string; role: Role },
) {
  if (live) {
    if (cmd.type === "contact.whatsapp" || cmd.type === "contact.voice")
      return (
        await request("/contact", {
          leadId: cmd.id,
          kind: cmd.type === "contact.voice" ? "Voice" : "WhatsApp",
        })
      ).state as State;
    return (await request("/command", cmd)).state as State;
  }
  const next = reduce(state, cmd, actor);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}
export const demoVisible = visibleState;
export function resetDemo() {
  window.localStorage.removeItem(storageKey);
  return emptyState();
}
export type { Session };
