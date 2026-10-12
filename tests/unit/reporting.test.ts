import { it, expect } from "vitest";
import { seed } from "../../src/seed";
import { reduce, visibleState, type State } from "../../src/domain";
import { periodRange, summarize } from "../../src/reporting";
const admin = { id: "demo-admin", role: "admin" as const };
const sales = { id: "demo-sales", role: "sales" as const };
const now = "2026-10-05T10:00:00.000Z";
function ordered() {
  let s = seed();
  s.quotes = [];
  s.orders = [];
  s.enquiries = s.enquiries.slice(0, 1);
  s.enquiries[0].createdAt = "2026-09-30T20:00:00.000Z";
  s.settings.taxBps = 0;
  s.settings.deliveryTaxBps = 0;
  s = reduce(
    s,
    {
      type: "quote.create",
      enquiryId: s.enquiries[0].id,
      selections: [{ productId: "p0", quantity: "2" }],
    },
    admin,
    now,
  );
  s = reduce(
    s,
    { type: "quote.approve", id: s.quotes[0].id, reason: "Synthetic reviewed" },
    admin,
    now,
  );
  return reduce(s, { type: "order.create", id: s.quotes[0].id }, admin, now);
}
it("uses Monday weeks, calendar months and leap years", () => {
  expect(periodRange("Weekly", "2026-10-04")).toEqual({
    from: "2026-09-28",
    to: "2026-10-04",
  });
  expect(periodRange("Monthly", "2024-02-14").to).toBe("2024-02-29");
  expect(periodRange("Yearly", "2026-10-05")).toEqual({
    from: "2026-01-01",
    to: "2026-12-31",
  });
  expect(() => periodRange("Monthly", "2026-02-30")).toThrow();
});
it("counts enquiry cohort in business timezone and exact cost from won order snapshots", () => {
  const s = ordered();
  const r = summarize(s, "2026-10-01", "2026-10-31");
  expect(r.enquiries).toBe(1);
  expect(r.quotes).toBe(1);
  expect(r.quoteConversion).toBe(1);
  expect(r.orders).toBe(1);
  expect(r.orderValue).toBe(2080000);
  expect(r.cost).toBe(1780000);
  expect(r.grossMargin).toBe(300000);
  s.orders[0].status = "Cancelled";
  expect(summarize(s, "2026-10-01", "2026-10-31").orderValue).toBe(0);
});
it("counts quote numbers once, not approved revisions", () => {
  const s = ordered();
  s.quotes.push({ ...s.quotes[0], id: "revision", revision: 2 });
  expect(summarize(s, "2026-10-01", "2026-10-31").quotes).toBe(1);
  expect(summarize(s, "2026-10-01", "2026-10-31").revisions).toBe(2);
});
it("keeps missing costs unknown and operating bills separate from AI estimates", () => {
  let s = ordered();
  s.orders[0].lines[0].cost = null;
  s = reduce(
    s,
    {
      type: "report.expense",
      expense: {
        category: "AI",
        date: "2026-10-05",
        amount: 12345,
        reference: "invoice-1",
        notes: "",
      },
    },
    admin,
    now,
  );
  s.usage = [
    {
      id: "u",
      at: now,
      user: admin.id,
      inputTokens: 100,
      outputTokens: 20,
      estimatedMicros: 500,
      status: "complete",
    },
  ];
  const r = summarize(s, "2026-10-01", "2026-10-31");
  expect(r.cost).toBeNull();
  expect(r.grossMargin).toBeNull();
  expect(r.spending).toBe(12345);
  expect(r.ai.micros).toBe(500);
});
it("separates unanswered/busy, failures, cancelled appointments and simulations", () => {
  let s = seed();
  for (const outcome of [
    "Answered",
    "Unanswered",
    "Busy",
    "Failed",
    "Cancelled",
  ])
    s = reduce(
      s,
      {
        type: "report.call",
        record: {
          customerId: "c1",
          leadId: "",
          at: now,
          mode: "Manual",
          outcome,
          durationSeconds: outcome === "Answered" ? 120 : 0,
          reference: outcome,
          cost: null,
          quality: outcome === "Answered" ? 4 : null,
          notes: "",
        },
      },
      admin,
      now,
    );
  s = reduce(
    s,
    {
      type: "report.call",
      record: {
        customerId: "c1",
        at: now,
        mode: "Demo",
        outcome: "Answered",
        durationSeconds: 0,
        reference: "demo",
        cost: 0,
        quality: null,
        notes: "",
      },
    },
    admin,
    now,
  );
  const r = summarize(s, "2026-10-01", "2026-10-31");
  expect(r.calls).toBe(4);
  expect(r.unattended).toBe(2);
  expect(r.failed).toBe(1);
  expect(r.simulated).toBe(1);
  expect(r.quality).toBe(4);
  expect(r.reviewed).toBe(1);
  expect(r.callCost).toBeNull();
});
it("rejects sales writes and duplicate invoice/call references and hides finances", () => {
  let s = seed();
  const expense = {
    category: "Hosting",
    date: "2026-10-05",
    amount: 10000,
    reference: "cf-1",
    notes: "",
  };
  expect(() =>
    reduce(s, { type: "report.expense", expense }, sales, now),
  ).toThrow("admin");
  s = reduce(s, { type: "report.expense", expense }, admin, now);
  expect(() =>
    reduce(s, { type: "report.expense", expense }, admin, now),
  ).toThrow("already");
  expect(visibleState(s, "sales").expenses).toEqual([]);
  expect(visibleState(s, "sales").callRecords).toEqual([]);
});
