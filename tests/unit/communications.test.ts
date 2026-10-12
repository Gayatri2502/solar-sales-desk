import { it, expect } from "vitest";
import { reduce, visibleState } from "../../src/domain";
import { seed } from "../../src/seed";
const admin = { id: "demo-admin", role: "admin" as const },
  sales = { id: "demo-sales", role: "sales" as const },
  now = "2026-10-05T05:00:00.000Z";
function fixture() {
  let s = seed();
  s.leads = [];
  s.communicationJobs = [];
  s.customers[0].phone = "+919999999999";
  s = reduce(
    s,
    {
      type: "lead.capture",
      lead: {
        customerId: s.customers[0].id,
        source: "Website form",
        sourceReference: "form-test",
        whatsapp: "+919999999999",
        whatsappConsent: "Explicit test permission",
        notes: "",
      },
    },
    sales,
    now,
  );
  return reduce(
    s,
    {
      type: "comms.policy",
      policy: {
        autoCalls: false,
        monthlyCeiling: 1000,
        userDaily: 2,
        tenantDaily: 2,
      },
    },
    admin,
    now,
  );
}
it("reserves estimated spending, rejects duplicate requests and exhaustion, hides estimates from sales", () => {
  let s = fixture();
  s = reduce(
    s,
    {
      type: "comms.queue",
      leadId: s.leads![0].id,
      kind: "WhatsApp",
      estimate: 600,
    },
    sales,
    now,
  );
  expect(() =>
    reduce(
      s,
      {
        type: "comms.queue",
        leadId: s.leads![0].id,
        kind: "WhatsApp",
        estimate: 600,
      },
      sales,
      now,
    ),
  ).toThrow(/already/);
  expect(
    visibleState(s, "sales").communicationJobs![0].estimatedCost,
  ).toBeNull();
  expect(() =>
    reduce(
      s,
      { type: "comms.policy", policy: s.communicationPolicy },
      sales,
      now,
    ),
  ).toThrow(/admin/);
  s.communicationJobs![0].key = "previous";
  expect(() =>
    reduce(
      s,
      {
        type: "comms.queue",
        leadId: s.leads![0].id,
        kind: "WhatsApp",
        estimate: 600,
      },
      sales,
      now,
    ),
  ).toThrow(/ceiling/);
});
it("opt-out cancels queued contact, prevents claim, and replayed inbound messages do not create extra leads", () => {
  let s = fixture();
  s = reduce(
    s,
    {
      type: "comms.queue",
      leadId: s.leads![0].id,
      kind: "WhatsApp",
      estimate: 50,
    },
    sales,
    now,
  );
  const id = s.communicationJobs![0].id,
    cmd = {
      type: "comms.inbound",
      message: {
        id: "wamid-stop",
        phone: "+919999999999",
        text: "STOP",
        at: now,
        reply: "Opted out",
      },
    };
  s = reduce(s, cmd, admin, now);
  expect(s.communicationJobs![0].status).toBe("Cancelled");
  expect(() => reduce(s, { type: "comms.claim", id }, admin, now)).toThrow();
  s = reduce(s, cmd, admin, now);
  expect(s.inboundMessages).toHaveLength(1);
  expect(s.leads).toHaveLength(1);
});
it("voice requires agreed due appointment, claims once and records verified completion without creating quotes or orders", () => {
  let s = fixture(),
    leadId = s.leads![0].id;
  expect(() =>
    reduce(
      s,
      { type: "comms.queue", leadId, kind: "Voice", estimate: 100 },
      sales,
      now,
    ),
  ).toThrow(/appointment/);
  s = reduce(
    s,
    {
      type: "lead.qualify",
      id: leadId,
      response: "Products",
      evidence: "Requested callback",
    },
    sales,
    now,
  );
  s = reduce(
    s,
    {
      type: "lead.schedule",
      id: leadId,
      at: "2026-10-05T05:01:00.000Z",
      consent: "Agreed automated call",
      language: "English",
    },
    sales,
    now,
  );
  const due = "2026-10-05T05:02:00.000Z";
  s = reduce(
    s,
    { type: "comms.queue", leadId, kind: "Voice", estimate: 100 },
    sales,
    due,
  );
  const id = s.communicationJobs![0].id;
  s = reduce(s, { type: "comms.claim", id }, admin, due);
  expect(() => reduce(s, { type: "comms.claim", id }, admin, due)).toThrow(
    /already/,
  );
  s = reduce(
    s,
    { type: "comms.accepted", id, providerId: "provider-1" },
    admin,
    due,
  );
  const result = {
    providerId: "wrong",
    outcome: "Answered",
    duration: 30,
    transcript: "Needs panels; quantity unclear",
    at: due,
  };
  expect(() =>
    reduce(s, { type: "comms.callCompleted", id, result }, admin, due),
  ).toThrow(/match/);
  const orders = s.orders.length,
    quotes = s.quotes.length;
  s = reduce(
    s,
    {
      type: "comms.callCompleted",
      id,
      result: { ...result, providerId: "provider-1" },
    },
    admin,
    due,
  );
  expect(s.leads![0].status).toBe("Details captured");
  expect(s.callRecords!.at(-1)?.mode).toBe("Live");
  expect(s.orders).toHaveLength(orders);
  expect(s.quotes).toHaveLength(quotes);
  expect(() =>
    reduce(
      s,
      {
        type: "comms.callCompleted",
        id,
        result: { ...result, providerId: "provider-1" },
      },
      admin,
      due,
    ),
  ).toThrow();
});
