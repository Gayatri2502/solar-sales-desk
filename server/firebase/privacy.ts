import { FirebaseStore, StoreError, type Member } from "./store";
import { type State } from "../../src/domain";
export async function privateDocuments(store: FirebaseStore, prefix: string) {
  if (!/^(ai-|usage-|delete-)[A-Za-z0-9_-]*$/.test(prefix))
    throw Error("Invalid private data scope.");
  const lower = store.root + "/documents/system/" + prefix,
    upper = lower + "~";
  const result = (await store.call(store.root + "/documents:runQuery", {
    structuredQuery: {
      from: [{ collectionId: "system" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "__name__" },
                op: "GREATER_THAN_OR_EQUAL",
                value: { referenceValue: lower },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "__name__" },
                op: "LESS_THAN",
                value: { referenceValue: upper },
              },
            },
          ],
        },
      },
      limit: 200,
    },
  })) as {
    document?: {
      name: string;
      fields: { json: { stringValue: string } };
      updateTime: string;
    };
  }[];
  return result.flatMap((r) =>
    r.document && r.document.name.startsWith(lower) ? [r.document] : [],
  );
}
export async function purgeTenant(store: FirebaseStore, tenant: string) {
  for (const prefix of ["ai-" + tenant + "-", "usage-" + tenant + "-"]) {
    for (let batch = 0; batch < 20; batch++) {
      const docs = await privateDocuments(store, prefix);
      if (!docs.length) break;
      await store.call(store.root + "/documents:commit", {
        writes: docs.map((d) => ({
          delete: d.name,
          currentDocument: { updateTime: d.updateTime },
        })),
      });
      if (batch === 19) return false;
    }
  }
  const marker = await store.get<any>("system/delete-" + tenant);
  if (marker)
    await store.call(store.root + "/documents:commit", {
      writes: [
        store.write(
          "system/delete-" + tenant,
          {
            ...marker.value,
            status: "complete",
            completedAt: new Date().toISOString(),
          },
          marker.stamp,
        ),
      ],
    });
  return true;
}
export async function firebaseDelete(
  store: FirebaseStore,
  ctx: Member,
  confirmation: string,
) {
  if (ctx.role !== "admin" || confirmation !== "DELETE")
    throw Error("Business admin and explicit DELETE confirmation required.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await store.get<Member>("members/" + ctx.id),
      snapshot = await store.get<State>("businesses/" + ctx.tenant);
    if (
      !member ||
      member.value.role !== "admin" ||
      member.value.tenant !== ctx.tenant ||
      !snapshot
    )
      throw Error("Business admin required.");
    const s = snapshot.value;
    if (s.users.length > 400)
      throw Error(
        "Operator-assisted deletion required for this business size.",
      );
    if (
      s.communicationJobs?.some(
        (j) =>
          j.kind === "Voice" &&
          ["Starting", "Accepted", "Uncertain"].includes(j.status),
      ) ||
      s.invoices?.some((i) => i.status === "Sending")
    )
      throw Error(
        "Resolve active or uncertain outbound deliveries before deleting the business.",
      );
    const users = await Promise.all(
      s.users.map((u) => store.get<Member>("members/" + u.id)),
    );
    if (users.some((m) => !m || m.value.tenant !== ctx.tenant))
      throw Error("Membership reconciliation required before deletion.");
    const marker = await store.get<any>("system/delete-" + ctx.tenant);
    try {
      await store.call(store.root + "/documents:commit", {
        writes: [
          {
            verify: store.name("members/" + ctx.id),
            currentDocument: { updateTime: member.stamp },
          },
          {
            delete: store.name("businesses/" + ctx.tenant),
            currentDocument: { updateTime: snapshot.stamp },
          },
          ...users.map((m, i) => ({
            delete: store.name("members/" + s.users[i].id),
            currentDocument: { updateTime: m!.stamp },
          })),
          store.write(
            "system/delete-" + ctx.tenant,
            {
              tenant: ctx.tenant,
              status: "pending",
              requestedAt: new Date().toISOString(),
            },
            marker?.stamp,
          ),
        ],
      });
      const complete = await purgeTenant(store, ctx.tenant).catch(() => false);
      return {
        ok: true,
        purgeComplete: complete,
        note: complete
          ? "Business data removed. Auth-account removal and provider-retained records require operator review."
          : "Business access revoked; private cache purge is queued for maintenance.",
      };
    } catch (e) {
      if (!(e instanceof StoreError) || ![409, 412].includes(e.status)) throw e;
    }
  }
  throw Error("Business changed. Refresh before deletion.");
}
export async function firebaseExport(store: FirebaseStore, ctx: Member) {
  if (ctx.role !== "admin") throw Error("Business admin required.");
  const state = await store.get<State>("businesses/" + ctx.tenant);
  if (!state) throw Error("Business unavailable.");
  const rows: any[] = [];
  const docs = await privateDocuments(store, "usage-" + ctx.tenant + "-");
  if (docs.length >= 200)
    throw Error("Operator-assisted export required for this history size.");
  for (const d of docs)
    rows.push(...(JSON.parse(d.fields.json.stringValue).rows || []));
  await store.audit(ctx.id, ctx.tenant, "business.export", ctx.tenant);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tenant: ctx.tenant,
    state: state.value,
    usage: rows,
  };
}
export async function finishPendingDeletions(store: FirebaseStore) {
  const docs = await privateDocuments(store, "delete-");
  for (const d of docs.slice(0, 10)) {
    const v = JSON.parse(d.fields.json.stringValue);
    if (v.status === "pending")
      await purgeTenant(store, v.tenant).catch(() => false);
  }
}

export async function expireExtractionCaches(store: FirebaseStore) {
  const result = (await store.call(store.root + "/documents:runQuery", {
    structuredQuery: {
      from: [{ collectionId: "system" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "expiresAt" },
          op: "LESS_THAN_OR_EQUAL",
          value: { timestampValue: new Date().toISOString() },
        },
      },
      limit: 100,
    },
  })) as { document?: { name: string; updateTime: string } }[];
  const docs = result.flatMap((r) =>
    r.document?.name.startsWith(store.root + "/documents/system/ai-") &&
    !r.document.name.includes("/ai-budget-")
      ? [r.document]
      : [],
  );
  if (docs.length)
    await store.call(store.root + "/documents:commit", {
      writes: docs.map((d) => ({
        delete: d.name,
        currentDocument: { updateTime: d.updateTime },
      })),
    });
}
