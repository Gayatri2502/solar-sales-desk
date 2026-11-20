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
const databaseName = "solar-sales-desk-local";
const databaseVersion = 1;
const workspaceKey = "workspace";
async function localRequest(path: string, data?: unknown) {
  const response = await fetch(`/api/local${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Local database request failed.");
  return result;
}
function openLocalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser does not support local database storage."));
      return;
    }
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("workspaces"))
        db.createObjectStore("workspaces");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the local database."));
  });
}
async function readLocalState(): Promise<State | null> {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readonly");
    const request = tx.objectStore("workspaces").get(workspaceKey);
    request.onsuccess = () => resolve(request.result?.version === 1 ? request.result as State : null);
    request.onerror = () => reject(request.error || new Error("Could not read the local database."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not read the local database.")); };
  });
}
async function writeLocalState(state: State): Promise<void> {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readwrite");
    tx.objectStore("workspaces").put(state, workspaceKey);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save the local database.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("The local database save was cancelled.")); };
  });
}
export async function loadDemo(): Promise<State> {
  if (import.meta.env.DEV) return (await localRequest("/state")).state as State;
  try {
    const saved = await readLocalState();
    if (saved) return saved;
    // One-time migration from the earlier browser-local preview format.
    const legacy = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    const initial: State = legacy?.version === 1 ? legacy : emptyState();
    await writeLocalState(initial);
    window.localStorage.removeItem(storageKey);
    return initial;
  } catch (error) {
    // Keep a recoverable fallback for browsers where IndexedDB is unavailable.
    try {
      const legacy = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (legacy?.version === 1) return legacy;
    } catch { /* start an empty local workspace */ }
    throw error;
  }
}
export async function request(path: string, body?: unknown) {
  const session = (await auth?.auth.getSession())?.data.session;
  const r = await fetch(`${(env.VITE_API_URL || "").replace(/\/$/, "")}/api${path}`, {
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
  if (import.meta.env.DEV)
    return (await localRequest("/command", { command: cmd, actor })).state as State;
  const next = reduce(state, cmd, actor);
  await writeLocalState(next);
  return next;
}
export const demoVisible = visibleState;
export async function resetDemo() {
  if (import.meta.env.DEV) return (await localRequest("/reset", {})).state as State;
  const next = emptyState();
  await writeLocalState(next);
  window.localStorage.removeItem(storageKey);
  return next;
}
export type { Session };
export type IntegrationStatus = {
  bound: boolean;
  whatsapp: { configured: boolean; enabled: boolean };
  voice: { configured: boolean; enabled: boolean };
  note: string;
};
