import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { z } from "zod";
import {
  reduce,
  visibleState,
  type State,
  type Command,
  type Role,
} from "../../src/domain";
import { emptyState } from "../../src/seed";
export type FirebaseEnv = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_WEB_API_KEY?: string;
};
export type Member = { tenant: string; id: string; role: Role };
const keys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);
export async function firebaseIdentity(
  token: string,
  project: string,
  verificationKeys: Parameters<typeof jwtVerify>[1] = keys,
) {
  const { payload } = await jwtVerify(token, verificationKeys, {
    issuer: "https://securetoken.google.com/" + project,
    audience: project,
    algorithms: ["RS256"],
  });
  if (
    !payload.sub ||
    payload.sub.length > 128 ||
    payload.email_verified !== true
  )
    throw Error("Verified email authentication required.");
  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
  };
}
type Document = {
  name: string;
  fields: { json: { stringValue: string } };
  updateTime: string;
};
export class StoreError extends Error {
  constructor(public status: number) {
    super("Firebase operation failed (" + status + ").");
  }
}
const tokenCache = new Map<string, { token: string; until: number }>();
export class FirebaseStore {
  readonly root: string;
  private cached?: { token: string; until: number };
  constructor(
    private env: FirebaseEnv,
    private transport: typeof fetch = fetch,
  ) {
    z.string()
      .regex(/^[a-z][a-z0-9-]{5,29}$/)
      .parse(env.FIREBASE_PROJECT_ID);
    z.string()
      .regex(/^[a-z][a-z0-9-]{3,62}$/)
      .parse(env.FIREBASE_DATABASE_ID);
    this.root =
      "projects/" +
      env.FIREBASE_PROJECT_ID +
      "/databases/" +
      env.FIREBASE_DATABASE_ID;
  }
  name(path: string) {
    if (!/^(members|businesses|system)\/[A-Za-z0-9_-]{1,128}$/.test(path))
      throw Error("Invalid database path.");
    return this.root + "/documents/" + path;
  }
  async token() {
    if (this.cached && this.cached.until > Date.now()) return this.cached.token;
    if (
      !this.env.FIREBASE_SERVICE_ACCOUNT_EMAIL ||
      !this.env.FIREBASE_PRIVATE_KEY
    )
      throw Error("Firebase server credentials are not configured.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(this.env.FIREBASE_PRIVATE_KEY),
    );
    const cacheKey =
      this.env.FIREBASE_PROJECT_ID +
      "|" +
      this.env.FIREBASE_SERVICE_ACCOUNT_EMAIL +
      "|" +
      Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
    const shared = tokenCache.get(cacheKey);
    if (shared && shared.until > Date.now()) {
      this.cached = shared;
      return shared.token;
    }
    const signingKey = await importPKCS8(
      this.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      "RS256",
    );
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/cloud-platform",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.env.FIREBASE_SERVICE_ACCOUNT_EMAIL)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(signingKey);
    const r = await this.transport("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("Firebase server authentication failed.");
    const data = (await r.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token)
      throw Error("Invalid server authentication response.");
    this.cached = {
      token: data.access_token,
      until:
        Date.now() + Math.min(data.expires_in || 3600, 3600) * 1000 - 60000,
    };
    if (tokenCache.size >= 32)
      tokenCache.delete(tokenCache.keys().next().value!);
    tokenCache.set(cacheKey, this.cached);
    return data.access_token;
  }
  async call(path: string, body?: unknown) {
    const r = await this.transport(
      "https://firestore.googleapis.com/v1/" + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + (await this.token()),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok) throw new StoreError(r.status);
    return r.json();
  }
  async get<T>(path: string): Promise<{ value: T; stamp: string } | null> {
    try {
      const d = (await this.call(this.name(path))) as Document;
      return {
        value: JSON.parse(d.fields.json.stringValue),
        stamp: d.updateTime,
      };
    } catch (e) {
      if (e instanceof StoreError && e.status === 404) return null;
      throw e;
    }
  }
  write(path: string, value: unknown, stamp?: string) {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > 750000)
      throw Error(
        "Business data capacity reached. Export and contact the operator before adding more records.",
      );
    return {
      update: {
        name: this.name(path),
        fields: {
          json: { stringValue: json },
          ...(path.startsWith("system/ai-") &&
          !path.startsWith("system/ai-budget-") &&
          typeof (value as any)?.createdAt === "string"
            ? {
                expiresAt: {
                  timestampValue: new Date(
                    Date.parse((value as any).createdAt) + 86400000,
                  ).toISOString(),
                },
              }
            : {}),
        },
      },
      currentDocument: stamp ? { updateTime: stamp } : { exists: false },
    };
  }
  async onboard(id: string, email: string, name: string) {
    const state = emptyState();
    state.settings.name = z.string().trim().min(1).max(200).parse(name);
    state.users = [{ id, name: email || "Admin", role: "admin" }];
    const tenant = crypto.randomUUID();
    await this.call(this.root + "/documents:commit", {
      writes: [
        this.write("members/" + id, { tenant, id, role: "admin" }),
        this.write("businesses/" + tenant, state),
      ],
    });
    return tenant;
  }
  async member(id: string): Promise<Member> {
    const m = await this.get<Member>("members/" + id);
    if (
      !m ||
      m.value.id !== id ||
      !["admin", "sales"].includes(m.value.role) ||
      !z.uuid().safeParse(m.value.tenant).success
    )
      throw Error("Business membership required.");
    return m.value;
  }
  async snapshot(id: string) {
    const m = await this.member(id),
      s = await this.get<State>("businesses/" + m.tenant);
    if (!s) throw Error("Business unavailable.");
    const current = await this.member(id);
    if (current.tenant !== m.tenant)
      throw Error("Business membership changed.");
    return { state: visibleState(s.value, current.role), role: current.role };
  }
  async audit(id: string, tenant: string, type: string, entity: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const m = await this.get<Member>("members/" + id),
        s = await this.get<State>("businesses/" + tenant);
      if (!m || m.value.tenant !== tenant || !s)
        throw Error("Business membership required.");
      const next = structuredClone(s.value);
      next.events.push({
        at: new Date().toISOString(),
        user: id,
        type,
        entity,
      });
      try {
        await this.call(this.root + "/documents:commit", {
          writes: [
            {
              verify: this.name("members/" + id),
              currentDocument: { updateTime: m.stamp },
            },
            this.write("businesses/" + tenant, next, s.stamp),
          ],
        });
        return;
      } catch (e) {
        if (!(e instanceof StoreError) || ![409, 412].includes(e.status))
          throw e;
      }
    }
    throw Error("Audit save conflict.");
  }
  async dispatchTenant(tenant: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const old = await this.get<{ ids: string[] }>("system/dispatch-tenants"),
        ids = old?.value.ids || [];
      if (ids.includes(tenant)) return;
      if (ids.length >= 1000) throw Error("Dispatcher capacity reached.");
      try {
        await this.call(this.root + "/documents:commit", {
          writes: [
            this.write(
              "system/dispatch-tenants",
              { ids: [...ids, tenant] },
              old?.stamp,
            ),
          ],
        });
        return;
      } catch (e) {
        if (!(e instanceof StoreError) || ![409, 412].includes(e.status))
          throw e;
      }
    }
    throw Error("Dispatcher registration conflict.");
  }
  async mutate(id: string, cmd: Command) {
    const member = await this.member(id);
    const state = await this.mutateTrusted(id, member.tenant, cmd),
      current = await this.member(id);
    if (current.tenant !== member.tenant)
      throw Error("Business membership changed.");
    return visibleState(state, current.role);
  }
  async mutateTrusted(id: string, tenant: string, cmd: Command) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const m = await this.get<Member>("members/" + id);
      if (!m) throw Error("Business membership required.");
      const ctx = await this.member(id);
      if (ctx.tenant !== tenant) throw Error("Business membership required.");
      const s = await this.get<State>("businesses/" + ctx.tenant);
      if (!s) throw Error("Business unavailable.");
      const next = reduce(s.value, cmd, ctx);
      try {
        await this.call(this.root + "/documents:commit", {
          writes: [
            {
              verify: this.name("members/" + id),
              currentDocument: { updateTime: m.stamp },
            },
            this.write("businesses/" + ctx.tenant, next, s.stamp),
          ],
        });
        return next;
      } catch (e) {
        if (!(e instanceof StoreError) || ![409, 412].includes(e.status))
          throw e;
      }
    }
    throw Error("Another user changed this business. Refresh and retry.");
  }
}
