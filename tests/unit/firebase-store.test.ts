import { it, expect } from "vitest";
import { FirebaseStore, firebaseIdentity } from "../../server/firebase/store";
import { seed } from "../../src/seed";
import { reduce, type State } from "../../src/domain";
const tenant = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const docs = new Map<string, { value: any; stamp: string }>(),
    store = new FirebaseStore(
      {
        FIREBASE_PROJECT_ID: "solar-sales-desk-20261012",
        FIREBASE_DATABASE_ID: "sales-native",
      },
      async (url, init) => {
        const path = String(url).split("/documents")[1];
        if (init?.method === "GET") {
          const d = docs.get(path);
          return d
            ? new Response(
                JSON.stringify({
                  fields: { json: { stringValue: JSON.stringify(d.value) } },
                  updateTime: d.stamp,
                }),
              )
            : new Response("{}", { status: 404 });
        }
        const data = JSON.parse(String(init?.body));
        for (const w of data.writes) {
          const p = (w.verify || w.update.name).split("/documents")[1],
            d = docs.get(p);
          if (
            w.currentDocument.exists === false
              ? !!d
              : d?.stamp !== w.currentDocument.updateTime
          )
            return new Response("{}", { status: 409 });
        }
        for (const w of data.writes)
          if (w.update) {
            const p = w.update.name.split("/documents")[1];
            docs.set(p, {
              value: JSON.parse(w.update.fields.json.stringValue),
              stamp: String(Number(docs.get(p)?.stamp || 0) + 1),
            });
          }
        return new Response("{}");
      },
    );
  store.token = async () => "test-server-token";
  docs.set("/members/admin", {
    value: { id: "admin", tenant, role: "admin" },
    stamp: "1",
  });
  docs.set("/members/sales", {
    value: { id: "sales", tenant, role: "sales" },
    stamp: "1",
  });
  docs.set("/members/other", {
    value: {
      id: "other",
      tenant: "22222222-2222-4222-8222-222222222222",
      role: "admin",
    },
    stamp: "1",
  });
  docs.set("/businesses/" + tenant, { value: seed(), stamp: "1" });
  return { store, docs };
}
it("membership derives tenant and role; foreign member cannot read private business and sales cannot approve", async () => {
  const { store, docs } = fixture();
  await expect(store.snapshot("other")).rejects.toThrow(/unavailable/);
  await expect(store.snapshot("missing")).rejects.toThrow(/membership/);
  const view = await store.snapshot("sales");
  expect(view.state.products[0].cost).toBeNull();
  await expect(
    store.mutate("sales", {
      type: "comms.policy",
      policy: {
        autoCalls: true,
        monthlyCeiling: 1000,
        userDaily: 2,
        tenantDaily: 2,
      },
      role: "admin",
    }),
  ).rejects.toThrow(/admin/);
  expect(docs.get("/businesses/" + tenant)!.stamp).toBe("1");
});
it("atomic creation prevents duplicate onboarding without overwriting an existing membership", async () => {
  const { store, docs } = fixture();
  await expect(
    store.onboard("admin", "a@example.invalid", "Other"),
  ).rejects.toThrow();
  expect(docs.get("/members/admin")!.value.tenant).toBe(tenant);
});
it("competing orders reserve stock once; duplicate conversion cannot commit", async () => {
  const { store, docs } = fixture();
  let s = docs.get("/businesses/" + tenant)!.value as State;
  s.settings.taxBps = 0;
  s.settings.deliveryTaxBps = 0;
  s.products[0].physical = 20000;
  const ids: string[] = [];
  for (const e of s.enquiries) {
    s = reduce(
      s,
      {
        type: "quote.create",
        enquiryId: e.id,
        selections: [{ productId: "p0", quantity: "20" }],
      },
      { id: "admin", role: "admin" },
    );
    ids.push(s.quotes[0].id);
    s = reduce(
      s,
      { type: "quote.approve", id: s.quotes[0].id, reason: "Reviewed" },
      { id: "admin", role: "admin" },
    );
  }
  docs.set("/businesses/" + tenant, { value: s, stamp: "1" });
  const results = await Promise.allSettled(
    ids.map((id) => store.mutate("sales", { type: "order.create", id })),
  );
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const saved = docs.get("/businesses/" + tenant)!.value as State;
  expect(saved.orders).toHaveLength(1);
  expect(saved.products[0].reserved).toBe(20000);
  await expect(
    store.mutate("sales", {
      type: "order.create",
      id: saved.orders[0].quoteId,
    }),
  ).rejects.toThrow();
});

import { generateKeyPair, SignJWT } from "jose";
it("Firebase token verification enforces project audience, issuer, expiry, signature and verified email", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const make = (
    aud = "solar-sales-desk-20261012",
    verified = true,
    expires = "1h",
  ) =>
    new SignJWT({ email_verified: verified })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("admin")
      .setAudience(aud)
      .setIssuer("https://securetoken.google.com/solar-sales-desk-20261012")
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(privateKey);
  expect(
    (
      await firebaseIdentity(
        await make(),
        "solar-sales-desk-20261012",
        publicKey,
      )
    ).id,
  ).toBe("admin");
  await expect(
    firebaseIdentity(
      await make("other-project"),
      "solar-sales-desk-20261012",
      publicKey,
    ),
  ).rejects.toThrow();
  await expect(
    firebaseIdentity(
      await make(undefined, false),
      "solar-sales-desk-20261012",
      publicKey,
    ),
  ).rejects.toThrow(/Verified/);
  await expect(
    firebaseIdentity(
      await make(undefined, true, "-1h"),
      "solar-sales-desk-20261012",
      publicKey,
    ),
  ).rejects.toThrow();
  const wrong = await generateKeyPair("RS256");
  await expect(
    firebaseIdentity(
      await make(),
      "solar-sales-desk-20261012",
      wrong.publicKey,
    ),
  ).rejects.toThrow();
});
