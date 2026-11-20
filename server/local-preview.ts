import { chmodSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { reduce, type Command, type Role } from "../src/domain";
import { emptyState } from "../src/seed";

const maxBodyBytes = 1_500_000;
const send = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage) {
  const pieces: Buffer[] = [];
  let size = 0;
  for await (const piece of req) {
    const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("Request exceeds 1.5 MB.");
    pieces.push(chunk);
  }
  return JSON.parse(Buffer.concat(pieces).toString("utf8"));
}
function loopbackRequest(req: IncomingMessage, port: number) {
  const host = req.headers.host || "";
  const hostPort = Number(host.slice(host.lastIndexOf(":") + 1));
  const hostname = host.startsWith("[") ? "[::1]" : host.split(":")[0];
  if (hostPort !== port || !["127.0.0.1", "localhost", "[::1]"].includes(hostname))
    return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.port === String(port) && parsed.hostname === hostname;
  } catch {
    return false;
  }
}

/** Local-only SQLite persistence for the Vite workspace. Never enabled in a production build. */
export function localPreviewDatabase(): Plugin {
  return {
    name: "solar-desk-local-sqlite",
    configureServer(server) {
      const address = server.httpServer?.address();
      const port = typeof address === "object" && address ? address.port : 5173;
      const directory = resolve(process.cwd(), ".data");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const databasePath = resolve(directory, "solar-sales-desk.local.sqlite");
      const database = new DatabaseSync(databasePath);
      chmodSync(databasePath, 0o600);
      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS local_workspace (id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
      const find = database.prepare("SELECT state_json FROM local_workspace WHERE id = ?");
      const save = database.prepare("INSERT INTO local_workspace (id,state_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP");
      const getState = () => {
        const row = find.get("workspace") as { state_json?: string } | undefined;
        if (row?.state_json) return JSON.parse(row.state_json);
        const state = emptyState();
        save.run("workspace", JSON.stringify(state));
        return state;
      };
      server.httpServer?.once("close", () => database.close());
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url || "/", "http://localhost").pathname;
        if (!["/api/local/state", "/api/local/command", "/api/local/reset"].includes(path)) {
          next();
          return;
        }
        if (!loopbackRequest(req, port)) {
          send(res, 403, { error: "Local workspace API accepts requests from this computer only." });
          return;
        }
        try {
          if (path === "/api/local/state" && req.method === "GET") {
            send(res, 200, { state: getState() });
            return;
          }
          if (path === "/api/local/reset" && req.method === "POST") {
            const state = emptyState();
            save.run("workspace", JSON.stringify(state));
            send(res, 200, { state });
            return;
          }
          if (path === "/api/local/command" && req.method === "POST") {
            const input = await body(req) as { command?: Command; actor?: { role?: Role } };
            const role: Role = input.actor?.role === "sales" ? "sales" : "admin";
            database.exec("BEGIN IMMEDIATE");
            try {
              const state = reduce(getState(), input.command as Command, {
                id: role === "admin" ? "local-admin" : "local-sales",
                role,
              });
              save.run("workspace", JSON.stringify(state));
              database.exec("COMMIT");
              send(res, 200, { state });
            } catch (error) {
              database.exec("ROLLBACK");
              throw error;
            }
            return;
          }
          send(res, 405, { error: "Unsupported local workspace request." });
        } catch (error) {
          send(res, 400, { error: error instanceof Error ? error.message : "Local database request failed." });
        }
      });
    },
  };
}
