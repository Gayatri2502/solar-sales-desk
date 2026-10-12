import { z } from "zod";
import { FirebaseStore, StoreError, type Member } from "./store";
import { type State } from "../../src/domain";
export async function authRequest(
  store: FirebaseStore,
  path: string,
  body: unknown,
  webKey?: string,
) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/" +
      path +
      (webKey ? "?key=" + encodeURIComponent(webKey) : ""),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webKey ? {} : { Authorization: "Bearer " + (await store.token()) }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok)
    throw Error(
      "Firebase account operation failed. Check account permissions or use password recovery.",
    );
  return r.json();
}
export async function verifyCurrentAccount(
  store: FirebaseStore,
  token: string,
  key: string,
  id: string,
) {
  const data = await authRequest(
    store,
    "accounts:lookup",
    { idToken: token },
    key,
  );
  const user = data.users?.find((u: any) => u.localId === id);
  if (!user || !user.emailVerified || user.disabled)
    throw Error("Verified active account required.");
}
export async function firebaseAddUser(
  store: FirebaseStore,
  ctx: Member,
  input: unknown,
  webKey: string,
) {
  if (ctx.role !== "admin") throw Error("Business admin required.");
  const actor = await store.member(ctx.id);
  if (actor.role !== "admin" || actor.tenant !== ctx.tenant)
    throw Error("Business admin required.");
  const data = z
    .strictObject({
      email: z.email(),
      password: z.string().min(12).max(100),
      name: z.string().trim().min(1).max(100),
      role: z.enum(["admin", "sales"]),
    })
    .parse(input);
  const current = await store.get<State>("businesses/" + ctx.tenant);
  if (
    !current ||
    current.value.users.length >= current.value.settings.userLimit
  )
    throw Error("User allowance reached.");
  const account = await authRequest(
    store,
    "accounts:signUp",
    { email: data.email, password: data.password, returnSecureToken: true },
    webKey,
  );
  const id = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .parse(account.localId);
  try {
    await authRequest(
      store,
      "accounts:sendOobCode",
      { requestType: "VERIFY_EMAIL", idToken: account.idToken },
      webKey,
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const member = await store.get<Member>("members/" + ctx.id),
        snapshot = await store.get<State>("businesses/" + ctx.tenant);
      if (
        !member ||
        member.value.tenant !== ctx.tenant ||
        member.value.role !== "admin" ||
        !snapshot
      )
        throw Error("Business admin required.");
      const s = structuredClone(snapshot.value);
      if (s.users.length >= s.settings.userLimit)
        throw Error("User allowance reached.");
      s.users.push({ id, name: data.name, role: data.role });
      s.events.push({
        at: new Date().toISOString(),
        user: ctx.id,
        type: "user.created",
        entity: id,
      });
      try {
        await store.call(store.root + "/documents:commit", {
          writes: [
            {
              verify: store.name("members/" + ctx.id),
              currentDocument: { updateTime: member.stamp },
            },
            store.write("members/" + id, {
              id,
              tenant: ctx.tenant,
              role: data.role,
            }),
            store.write("businesses/" + ctx.tenant, s, snapshot.stamp),
          ],
        });
        return { user: id, verificationRequired: true };
      } catch (e) {
        if (!(e instanceof StoreError) || ![409, 412].includes(e.status))
          throw e;
      }
    }
    throw Error("User membership conflict.");
  } catch (e) {
    const saved = await store
      .get<Member>("members/" + id)
      .catch(() => undefined);
    if (saved?.value.tenant === ctx.tenant)
      return { user: id, verificationRequired: true };
    if (saved === null)
      await authRequest(
        store,
        "accounts:delete",
        { idToken: account.idToken },
        webKey,
      ).catch(() => {});
    throw e;
  }
}
export async function firebaseResetPassword(
  store: FirebaseStore,
  ctx: Member,
  input: unknown,
) {
  if (ctx.role !== "admin") throw Error("Business admin required.");
  const actor = await store.member(ctx.id);
  if (actor.role !== "admin" || actor.tenant !== ctx.tenant)
    throw Error("Business admin required.");
  const data = z
    .strictObject({
      userId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      password: z.string().min(12).max(100),
    })
    .parse(input);
  const target = await store.member(data.userId);
  if (target.tenant !== ctx.tenant)
    throw Error("User not found in this business.");
  await authRequest(
    store,
    "projects/" + store.root.split("/")[1] + "/accounts:update",
    {
      localId: data.userId,
      password: data.password,
      validSince: String(Math.floor(Date.now() / 1000)),
    },
  );
  await store.audit(ctx.id, ctx.tenant, "password.reset", data.userId);
  return { ok: true };
}
