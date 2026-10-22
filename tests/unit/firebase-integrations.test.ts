import { it, expect, vi } from "vitest";
import { firebaseFixture, tenant } from "../helpers/firebase";
import { FirebaseBridge, firebaseMutate } from "../../server/firebase/bridge";
import {
  reserveExtraction,
  finishExtraction,
  usageRows,
} from "../../server/firebase/ai";
import { firebaseDelete, firebaseExport, finishPendingDeletions } from "../../server/firebase/privacy";
import { reduce, mockExtract } from "../../src/domain";
import {
  runJob,
  handleProviderWebhook,
} from "../../server/integrations/service";
it("concurrent Firebase AI requests deduplicate before any paid provider request; cached output is schema validated and allowance exhaustion remains manual", async () => {
  const { store, ctx, docs } = firebaseFixture(),
    env = {
      USER_DAILY_AI_LIMIT: "1",
      TENANT_DAILY_AI_LIMIT: "2",
      APP_SPEND_CEILING_USD: "1",
    };
  const outcomes = await Promise.allSettled([
    reserveExtraction(store, ctx, "a".repeat(64), 100, env),
    reserveExtraction(store, ctx, "a".repeat(64), 100, env),
  ]);
  expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const ticket = (
    outcomes.find(
      (x) => x.status === "fulfilled",
    ) as PromiseFulfilledResult<any>
  ).value;
  await finishExtraction(store, ticket.path, ticket.id, {
    extraction: mockExtract("2 pcs panels"),
    inputTokens: 10,
    outputTokens: 20,
    estimatedMicros: 10,
  });
  const cached = await reserveExtraction(store, ctx, "a".repeat(64), 100, env);
  expect(cached).toHaveProperty("cached");
  await expect(
    reserveExtraction(store, ctx, "b".repeat(64), 100, env),
  ).rejects.toThrow(/allowance/);
  expect(
    docs.has("/system/ai-budget-" + new Date().toISOString().slice(0, 7)),
  ).toBe(true);
});
it("invoice delivery reservation is business/admin bound, idempotent and shares daily account cap", async () => {
  const { store, ctx, docs, sales } = firebaseFixture();
  let s = docs.get("/businesses/" + tenant)!.value;
  s.settings.taxBps = 0;
  s.settings.deliveryTaxBps = 0;
  s = reduce(
    s,
    {
      type: "quote.create",
      enquiryId: s.enquiries[0].id,
      selections: [{ productId: "p0", quantity: "2" }],
    },
    sales,
  );
  s = reduce(
    s,
    { type: "quote.approve", id: s.quotes[0].id, reason: "Reviewed" },
    ctx,
  );
  s = reduce(s, { type: "order.create", id: s.quotes[0].id }, sales);
  s = reduce(s, { type: "invoice.submit", id: s.invoices[0].id }, sales);
  s = reduce(s, { type: "invoice.approve", id: s.invoices[0].id }, ctx);
  docs.set("/businesses/" + tenant, { value: s, stamp: "1" });
  const bridge = new FirebaseBridge(store),
    params = {
      p_tenant: tenant,
      p_actor: "admin",
      p_invoice: s.invoices[0].id,
      p_revision: 1,
    };
  expect(
    (await bridge.rpc("reserve_invoice_email", { ...params, p_actor: "sales" }))
      .error,
  ).toBeTruthy();
  expect((await bridge.rpc("reserve_invoice_email", params)).error).toBeNull();
  expect((await bridge.rpc("reserve_invoice_email", params)).error).toBeNull();
  expect(docs.get("/system/email-quota")!.value.keys).toHaveLength(1);
});
it("Firebase provider job starts once under concurrent dispatch, while signed opt-out callback cancels queued work and duplicate callbacks are ignored", async () => {
  const { store, ctx, docs } = firebaseFixture();
  let s = docs.get("/businesses/" + tenant)!.value;
  s.leads = [];
  s.customers[0].phone = "+919999999999";
  s = reduce(
    s,
    {
      type: "lead.capture",
      lead: {
        customerId: s.customers[0].id,
        source: "Website form",
        sourceReference: "test",
        whatsapp: "+919999999999",
        whatsappConsent: "Recorded permission",
        notes: "",
      },
    },
    ctx,
  );
  s = reduce(
    s,
    {
      type: "comms.policy",
      policy: {
        autoCalls: false,
        monthlyCeiling: 1000,
        userDaily: 5,
        tenantDaily: 5,
      },
    },
    ctx,
  );
  s = reduce(
    s,
    {
      type: "comms.queue",
      leadId: s.leads[0].id,
      kind: "WhatsApp",
      estimate: 10,
    },
    ctx,
  );
  docs.set("/businesses/" + tenant, { value: s, stamp: "1" });
  const env = {
      INTEGRATIONS_TENANT_ID: tenant,
      WHATSAPP_ENABLED: "true",
      WHATSAPP_ACCESS_TOKEN: "fixture-key",
      WHATSAPP_APP_SECRET: "fixture-secret",
      WHATSAPP_VERIFY_TOKEN: "fixture-verify",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
      WHATSAPP_GRAPH_VERSION: "v25.0",
      WHATSAPP_QUALIFICATION_TEMPLATE: "qualification",
      WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR: "10",
    },
    db = new FirebaseBridge(store).asDatabase(),
    transport = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid-accepted" }] })),
    );
  await Promise.allSettled([
    runJob(db, ctx, s.communicationJobs[0].id, env, firebaseMutate, transport),
    runJob(db, ctx, s.communicationJobs[0].id, env, firebaseMutate, transport),
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "business",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "12345" },
              messages: [
                {
                  id: "stop-1",
                  from: "919999999999",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "STOP" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.WHATSAPP_APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  const request = () =>
    new Request("https://worker.example/api/hooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=" + signature },
    });
  expect(
    (await handleProviderWebhook(request(), raw, env, db, firebaseMutate))
      .status,
  ).toBe(200);
  expect(
    (await handleProviderWebhook(request(), raw, env, db, firebaseMutate))
      .status,
  ).toBe(200);
  expect(docs.get("/businesses/" + tenant)!.value.leads[0].status).toBe(
    "Opted out",
  );
  expect(docs.get("/businesses/" + tenant)!.value.inboundMessages).toHaveLength(
    1,
  );
});
it("business deletion revokes memberships and purges only its private cache; export and deletion reject sales", async () => {
  const { store, ctx, sales, docs } = firebaseFixture();
  docs.set("/system/ai-" + tenant + "-test", {
    value: { result: "private requirements" },
    stamp: "1",
  });
  docs.set("/system/ai-other-tenant-test", {
    value: { result: "other business" },
    stamp: "1",
  });
  await expect(firebaseExport(store, sales)).rejects.toThrow(/admin/);
  await expect(firebaseDelete(store, sales, "DELETE")).rejects.toThrow(/admin/);
  await expect(firebaseDelete(store, ctx, "wrong")).rejects.toThrow(/DELETE/);
  const result = await firebaseDelete(store, ctx, "DELETE");
  expect(result.purgeComplete).toBe(true);
  expect(docs.has("/members/admin")).toBe(false);
  expect(docs.has("/businesses/" + tenant)).toBe(false);
  expect(docs.has("/system/ai-" + tenant + "-test")).toBe(false);
  expect(docs.has("/system/ai-other-tenant-test")).toBe(true);
});
it("report usage counts the configured India day across a UTC month boundary", async () => {
  const { store, docs } = firebaseFixture();
  docs.set("/system/usage-" + tenant + "-2026-09", {
    stamp: "1",
    value: {
      rows: [
        {
          id: "x",
          at: "2026-09-30T19:00:00Z",
          user: "admin",
          inputTokens: 1,
          outputTokens: 2,
          estimatedMicros: 3,
          status: "complete",
        },
      ],
    },
  });
  expect(
    await usageRows(store, tenant, "2026-10-01", "2026-10-01", "Asia/Kolkata"),
  ).toHaveLength(1);
  expect(
    await usageRows(store, tenant, "2026-10-01", "2026-10-01", "UTC"),
  ).toHaveLength(0);
});

import {prepareFirebaseRestore} from '../../server/firebase/restore';
it('restore preserves existing membership grants and quarantines pending calls/invoices instead of replaying them',()=>{const {docs}=firebaseFixture(),current=docs.get('/businesses/'+tenant)!.value;const source=structuredClone(current);source.users=[{id:'outsider',role:'admin',name:'Injected'}];source.communicationPolicy={autoCalls:true,monthlyCeiling:100,userDaily:1,tenantDaily:1};source.communicationJobs=[{status:'Queued'},{status:'Accepted'}];source.leads=[{status:'Scheduled',scheduledAt:'future',callConsent:'old consent'}];source.invoices=[{status:'Sending',attempts:1,lease:'old'}];const restored=prepareFirebaseRestore(source,current);expect(restored.users).toEqual(current.users);expect(restored.communicationPolicy?.autoCalls).toBe(false);expect(restored.communicationJobs?.map(j=>j.status)).toEqual(['Cancelled','Uncertain']);expect(restored.invoices?.[0].attempts).toBe(3);expect(restored.leads?.[0].callConsent).toBe('');});


it("export rechecks the current admin role before releasing private costs", async () => {
  const {store,ctx,docs}=firebaseFixture();
  docs.set('/members/admin',{value:{...ctx,role:'sales'},stamp:'2'});
  await expect(firebaseExport(store,ctx)).rejects.toThrow(/role/);
});

it("completed deletion markers cannot permanently starve pending private-data purges", async () => {
  const {store,docs}=firebaseFixture();
  for(let n=0;n<12;n++)docs.set('/system/delete-complete-'+n,{value:{status:'complete'},stamp:'1'});
  docs.set('/system/delete-'+tenant,{value:{status:'pending',tenant},stamp:'1'});
  docs.set('/system/ai-'+tenant+'-retained',{value:{result:'private'},stamp:'1'});
  await finishPendingDeletions(store);
  await finishPendingDeletions(store);
  expect(docs.has('/system/ai-'+tenant+'-retained')).toBe(false);
  expect(docs.has('/system/delete-'+tenant)).toBe(false);
});


it("restore validates every ledger scope and duplicate before building a transaction", async () => {
 const {validateRestoreLedgers}=await import('../../server/firebase/restore');
 const valid={path:'system/usage-'+tenant+'-2026-10',value:{rows:[]}};
 expect(validateRestoreLedgers([valid],tenant)).toEqual([valid]);
 expect(()=>validateRestoreLedgers([valid,{...valid,path:'system/usage-other-2026-10'}],tenant)).toThrow(/scope/);
 expect(()=>validateRestoreLedgers([valid,valid],tenant)).toThrow(/duplicate/);
 expect(()=>validateRestoreLedgers([{...valid,path:'system/usage-'+tenant+'-2026-13'}],tenant)).toThrow(/scope/);
 expect(()=>validateRestoreLedgers([{...valid,value:{rows:'invalid'}}],tenant)).toThrow();
});


it("a competing ledger update aborts the complete restore without changing business data", async () => {
 const {store,docs}=firebaseFixture();
 const {restoreFirebaseSnapshot}=await import('../../server/firebase/restore');
 const path='system/usage-'+tenant+'-2026-10';
 docs.set('/'+path,{value:{rows:[]},stamp:'1'});
 const before=structuredClone(docs.get('/businesses/'+tenant)!);
 const source=structuredClone(before.value);source.settings.name='Restored name';
 const original=store.call.bind(store);
 vi.spyOn(store,'call').mockImplementation(async (url,body) => {
  if(url.endsWith('/documents:commit'))docs.set('/'+path,{value:{rows:[{request:'competing'}]},stamp:'changed'});
  return original(url,body);
 });
 await expect(restoreFirebaseSnapshot(store,tenant,source,[{path,value:{rows:[]}}])).rejects.toThrow();
 expect(docs.get('/businesses/'+tenant)).toEqual(before);
 expect(docs.get('/'+path)!.value.rows).toHaveLength(1);
});

it("a valid restore atomically restores the snapshot and usage ledger with outbound automation disabled", async () => {
 const {store,docs}=firebaseFixture();
 const {restoreFirebaseSnapshot}=await import('../../server/firebase/restore');
 const source=structuredClone(docs.get('/businesses/'+tenant)!.value);
 const path='system/usage-'+tenant+'-2026-10';
 await restoreFirebaseSnapshot(store,tenant,source,[{path,value:{rows:[{request:'saved'}]}}]);
 expect(docs.get('/'+path)!.value.rows).toEqual([{request:'saved'}]);
 expect(docs.get('/businesses/'+tenant)!.value.communicationPolicy.autoCalls).toBe(false);
 expect(docs.get('/businesses/'+tenant)!.value.events.at(-1).type).toBe('business.restore');
});
