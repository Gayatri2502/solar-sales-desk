import { describe, it, expect } from "vitest";
import { reduce, mockExtract, match } from "../../src/domain";
import { seed } from "../../src/seed";
import { leadInput, scheduledInstant } from "../../src/leads";
const actor = { id: "demo-sales", role: "sales" as const };
const now = "2026-10-05T05:00:00.000Z";
const due = "2026-10-05T05:01:00.000Z";
function captured() {
  let s = seed();
  s.leads = [];
  s.customers[0].phone = "+910000000001";
  return reduce(
    s,
    {
      type: "lead.capture",
      lead: {
        customerId: s.customers[0].id,
        source: "Website form",
        sourceReference: "form-1",
        whatsapp: "+910000000001",
        whatsappConsent: "Synthetic permission confirmed 5 October",
        notes: "",
      },
    },
    actor,
    now,
  );
}
function scheduled() {
  let s = captured();
  s = reduce(
    s,
    {
      type: "lead.qualify",
      id: s.leads![0].id,
      response: "Products",
      evidence: "Customer asked for supply and a call",
    },
    actor,
    now,
  );
  return reduce(
    s,
    {
      type: "lead.schedule",
      id: s.leads![0].id,
      at: due,
      consent: "Customer agreed to this time and an automated call",
      language: "Hindi",
    },
    actor,
    now,
  );
}
describe("lead qualification and call queue", () => {
  it("normalizes common WhatsApp number formats for the India pilot", () => {
    const base = {
      customerId: "customer-1",
      source: "Manual" as const,
    };
    expect(leadInput.parse({ ...base, whatsapp: "98765 43210" }).whatsapp).toBe("+919876543210");
    expect(leadInput.parse({ ...base, whatsapp: "+91 (98765)-43210" }).whatsapp).toBe("+919876543210");
    expect(leadInput.parse({ ...base, whatsapp: "919876543210" }).whatsapp).toBe("+919876543210");
    expect(() => leadInput.parse({ ...base, whatsapp: "987654321" })).toThrow();
  });
  it("deduplicates source records and open customer leads", () => {
    const s = captured();
    expect(() =>
      reduce(
        s,
        {
          type: "lead.capture",
          lead: {
            customerId: s.customers[0].id,
            source: "Website form",
            sourceReference: "form-1",
            whatsapp: "",
            notes: "",
          },
        },
        actor,
        now,
      ),
    ).toThrow("already");
  });
  it("requires permission for WhatsApp contact preparation and calls", () => {
    let s = captured();
    s.leads![0].whatsappConsent = "";
    expect(() =>
      reduce(
        s,
        {
          type: "lead.qualify",
          id: s.leads![0].id,
          response: "Awaiting reply",
          evidence: "Prepared",
        },
        actor,
        now,
      ),
    ).toThrow("permission");
    s = reduce(s, {
      type: "lead.whatsapp-permission",
      id: s.leads![0].id,
      evidence: "Customer opted in by email on 25 October 2026",
    }, actor, now);
    expect(s.leads![0].whatsappConsent).toContain("opted in");
    expect(() => reduce(s, {
      type: "lead.qualify",
      id: s.leads![0].id,
      response: "Awaiting reply",
      evidence: "Email received on 25 October 2026",
    }, actor, now)).not.toThrow();
    expect(() =>
      reduce(
        s,
        {
          type: "lead.schedule",
          id: s.leads![0].id,
          at: due,
          consent: "Yes",
          language: "English",
        },
        actor,
        now,
      ),
    ).toThrow("interest");
    s = reduce(
      s,
      {
        type: "lead.qualify",
        id: s.leads![0].id,
        response: "Products",
        evidence: "Yes",
      },
      actor,
      now,
    );
    expect(() =>
      reduce(
        s,
        {
          type: "lead.schedule",
          id: s.leads![0].id,
          at: due,
          consent: "",
          language: "English",
        },
        actor,
        now,
      ),
    ).toThrow();
  });
  it("runs only due calls once and opt-out cancels future contact", () => {
    let s = scheduled();
    expect(() =>
      reduce(s, { type: "lead.simulate", id: s.leads![0].id }, actor, now),
    ).toThrow("due");
    s = reduce(
      s,
      {
        type: "lead.qualify",
        id: s.leads![0].id,
        response: "Opted out",
        evidence: "Customer said stop",
      },
      actor,
      now,
    );
    expect(s.leads![0].scheduledAt).toBe("");
    expect(
      reduce(s, { type: "lead.simulateDue" }, actor, due).leads![0].attempts,
    ).toBe(0);
    s = scheduled();
    s = reduce(s, { type: "lead.simulateDue" }, actor, due);
    expect(s.leads![0].attempts).toBe(1);
    expect(
      reduce(s, { type: "lead.simulateDue" }, actor, due).leads![0].attempts,
    ).toBe(1);
  });
  it("captured details create one enquiry, then only admin can approve its quote", () => {
    let s = scheduled();
    s = reduce(s, { type: "lead.simulateDue" }, actor, due);
    const leadId = s.leads![0].id;
    s = reduce(
      s,
      {
        type: "lead.promote",
        id: leadId,
        extraction: mockExtract(s.leads![0].requirements),
      },
      actor,
      due,
    );
    const enquiry = s.leads![0].enquiryId;
    expect(() =>
      reduce(
        s,
        {
          type: "lead.promote",
          id: leadId,
          extraction: mockExtract("1 pcs panel"),
        },
        actor,
        due,
      ),
    ).toThrow("already");
    s.settings.taxBps = 0;
    s.settings.deliveryTaxBps = 0;
    s = reduce(
      s,
      {
        type: "quote.create",
        enquiryId: enquiry,
        selections: [{ productId: "p0", quantity: "20" }],
      },
      actor,
      due,
    );
    expect(() =>
      reduce(s, { type: "quote.sent", id: s.quotes[0].id }, actor, due),
    ).toThrow();
    expect(() =>
      reduce(s, { type: "quote.approve", id: s.quotes[0].id }, actor, due),
    ).toThrow("admin");
  });
  it("routes service requests to staff instead of inventing a product quote", () => {
    let s = captured();
    s = reduce(
      s,
      {
        type: "lead.qualify",
        id: s.leads![0].id,
        response: "Services",
        evidence: "Installation",
      },
      actor,
      now,
    );
    s = reduce(
      s,
      {
        type: "lead.requirements",
        id: s.leads![0].id,
        text: "Install a system",
      },
      actor,
      now,
    );
    expect(() =>
      reduce(
        s,
        {
          type: "lead.promote",
          id: s.leads![0].id,
          extraction: mockExtract("Install"),
        },
        actor,
        now,
      ),
    ).toThrow("Service");
  });
  it("uses business timezone and rejects nonexistent DST appointments", () => {
    expect(scheduledInstant("2026-10-05T10:31", "Asia/Kolkata")).toBe(due);
    expect(() =>
      scheduledInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow("does not exist");
  });
});

it("does not confuse requested quantity with a product specification", () => {
  expect(match("20 pcs 540 W panels", seed().products)[0].reason).not.toContain(
    "Verify specification: 20",
  );
});

it("suppresses new outreach after opt-out and requires renewed agreement after number changes",()=>{let s=scheduled();const id=s.leads![0].id;s.customers[0].phone="+910000000002";expect(()=>reduce(s,{type:"lead.schedule",id,at:due,consent:"old agreement",language:"English"},actor,now)).toThrow("number changed");s=reduce(s,{type:"lead.qualify",id,response:"Opted out",evidence:"Stop all contact"},actor,now);expect(()=>reduce(s,{type:"lead.capture",lead:{customerId:s.customers[0].id,source:"Instagram",whatsapp:"",notes:""}},actor,now)).toThrow("opted out");});
