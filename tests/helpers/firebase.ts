import { FirebaseStore } from "../../server/firebase/store";
import { seed } from "../../src/seed";
export const tenant = "11111111-1111-4111-8111-111111111111";
export function firebaseFixture() {
  const docs = new Map<
    string,
    { value: any; stamp: string; expiresAt?: string }
  >();
  let counter = 1;
  const store: FirebaseStore = new FirebaseStore(
    {
      FIREBASE_PROJECT_ID: "solar-sales-desk-20261012",
      FIREBASE_DATABASE_ID: "sales-native",
    },
    async (url, init) => {
      const path = String(url).split("/documents")[1];
      const document = (
        name: string,
        d: { value: any; stamp: string; expiresAt?: string },
      ) => ({
        name: store.root + "/documents" + name,
        fields: {
          json: { stringValue: JSON.stringify(d.value) },
          ...(d.expiresAt
            ? { expiresAt: { timestampValue: d.expiresAt } }
            : {}),
        },
        updateTime: d.stamp,
      });
      if (init?.method === "GET") {
        const d = docs.get(path);
        return d
          ? new Response(JSON.stringify(document(path, d)))
          : new Response("{}", { status: 404 });
      }
      const data = JSON.parse(String(init?.body));
      if (path === ":runQuery") {
        const q = data.structuredQuery,
          filters = q.where.compositeFilter?.filters || [q.where];
        let rows = [...docs].filter(([p]) => p.startsWith("/system/"));
        for (const f of filters) {
          const field = f.fieldFilter;
          if (field.field.fieldPath === "__name__") {
            const bound = field.value.referenceValue.split("/documents")[1];
            rows = rows.filter(([p]) =>
              field.op === "GREATER_THAN_OR_EQUAL" ? p >= bound : p < bound,
            );
          } else if (field.field.fieldPath === "expiresAt")
            rows = rows.filter(
              ([, d]) =>
                !!d.expiresAt && d.expiresAt <= field.value.timestampValue,
            );
        }
        return new Response(
          JSON.stringify(
            rows
              .slice(0, q.limit)
              .map(([p, d]) => ({ document: document(p, d) })),
          ),
        );
      }
      for (const w of data.writes) {
        const p = (w.verify || w.delete || w.update.name).split(
            "/documents",
          )[1],
          d = docs.get(p);
        if (
          w.currentDocument.exists === false
            ? !!d
            : d?.stamp !== w.currentDocument.updateTime
        )
          return new Response("{}", { status: 409 });
      }
      for (const w of data.writes) {
        if (w.delete) docs.delete(w.delete.split("/documents")[1]);
        if (w.update) {
          const p = w.update.name.split("/documents")[1];
          docs.set(p, {
            value: JSON.parse(w.update.fields.json.stringValue),
            stamp: String(++counter),
            expiresAt: w.update.fields.expiresAt?.timestampValue,
          });
        }
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
  const s = seed();
  s.users = [
    { id: "admin", name: "Admin", role: "admin" },
    { id: "sales", name: "Sales", role: "sales" },
  ];
  docs.set("/businesses/" + tenant, { value: s, stamp: "1" });
  return {
    store,
    docs,
    ctx: { id: "admin", tenant, role: "admin" as const },
    sales: { id: "sales", tenant, role: "sales" as const },
  };
}
