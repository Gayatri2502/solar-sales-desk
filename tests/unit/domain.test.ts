import { describe, it, expect } from "vitest";
import { seed } from "../../src/seed";
import {
  reduce,
  totals,
  qty,
  minor,
  visibleState,
  mockExtract,
  match,
  type State,
  type Line,
} from "../../src/domain";
import { previewCSV, customerCSV } from "../../src/csv";
import { extract, type AIConfig } from "../../server/provider";
const admin = { id: "demo-admin", role: "admin" as const },
  sales = { id: "demo-sales", role: "sales" as const };
function quoted() {
  let s = seed();
  s.settings.taxBps = 0;
  s.settings.deliveryTaxBps = 0;
  s = reduce(
    s,
    {
      type: "quote.create",
      enquiryId: s.enquiries[1].id,
      selections: [{ productId: "p0", quantity: "20" }],
    },
    admin,
  );
  return s;
}
function approved() {
  let s = quoted();
  return reduce(
    s,
    {
      type: "quote.approve",
      id: s.quotes[0].id,
      reason: "Verified demo stock",
    },
    admin,
  );
}
const line: Line = {
  productId: "p0",
  sku: "P",
  name: "Panel",
  unit: "pcs",
  quantity: "1.125",
  price: 10001,
  discountBps: 1250,
  taxBps: 725,
  cost: 8000,
};
describe("exact decimal calculations", () => {
  it("rounds quantity, discount and tax at each line", () => {
    expect(totals([line], 123, 500)).toEqual({
      subtotal: 11251,
      discount: 1406,
      net: 9845,
      tax: 720,
      total: 10688,
      cost: 9000,
      marginBps: 858,
    });
  });
  it("handles money without floating parsing", () => {
    expect(minor("0.29")).toBe(29);
    expect(qty("0.125")).toBe(125);
    expect(() => minor("1.001")).toThrow();
    expect(() => qty("0")).toThrow();
    expect(() => totals([{ ...line, taxBps: null }])).toThrow();
    expect(() => totals([{ ...line, discountBps: 10001 }])).toThrow();
  });
  it("handles 100% discount and missing cost", () => {
    const t = totals([{ ...line, discountBps: 10000, cost: null }]);
    expect(t.total).toBe(0);
    expect(t.cost).toBeNull();
    expect(t.marginBps).toBeNull();
  });
});
describe("approval permissions and revisions", () => {
  it("denies sales approval, product and settings mutation", () => {
    const s = quoted();
    expect(() =>
      reduce(s, { type: "quote.approve", id: s.quotes[0].id }, sales),
    ).toThrow("admin");
    expect(() =>
      reduce(s, { type: "product.save", product: s.products[0] }, sales),
    ).toThrow("admin");
    expect(() =>
      reduce(s, { type: "settings.save", settings: s.settings }, sales),
    ).toThrow("admin");
  });
  it("requires explicit taxes", () => {
    let s = seed();
    s = reduce(
      s,
      {
        type: "quote.create",
        enquiryId: s.enquiries[1].id,
        selections: [{ productId: "p0", quantity: "1" }],
      },
      admin,
    );
    expect(() =>
      reduce(
        s,
        { type: "quote.approve", id: s.quotes[0].id, reason: "reviewed" },
        admin,
      ),
    ).toThrow();
  });
  it("approved edit creates a fresh draft and preserves prior revision", () => {
    let s = approved();
    const q = s.quotes[0];
    s = reduce(
      s,
      {
        type: "quote.edit",
        id: q.id,
        patch: { ...q, lines: q.lines.map((l) => ({ ...l, quantity: "21" })) },
      },
      sales,
    );
    expect(s.quotes).toHaveLength(2);
    expect(s.quotes[0].status).toBe("Draft");
    expect(s.quotes[0].revision).toBe(2);
    expect(s.quotes[0].approvedAt).toBe("");
    expect(s.quotes[1].lines[0].quantity).toBe("20");
    expect(s.quotes[1].status).toBe("Superseded");
    expect(() =>
      reduce(s, { type: "order.create", id: q.id }, sales),
    ).toThrow();
  });
  it("sales payload contains no costs or approval audit", () => {
    const s = visibleState(approved(), "sales");
    expect(s.products.every((p) => p.cost === null)).toBe(true);
    expect(s.quotes[0].lines[0].cost).toBeNull();
    expect(s.audit).toHaveLength(0);
  });
});
describe("stock and duplicate orders", () => {
  it("reserves once and releases on cancellation", () => {
    let s = approved();
    const id = s.quotes[0].id;
    s = reduce(s, { type: "order.create", id }, sales);
    expect(s.products[0].reserved).toBe(20000);
    expect(s.products[0].physical).toBe(120000);
    expect(() => reduce(s, { type: "order.create", id }, sales)).toThrow(
      "already exists",
    );
    s = reduce(
      s,
      {
        type: "order.status",
        id: s.orders[0].id,
        status: "Cancelled",
        reason: "Customer cancelled",
      },
      sales,
    );
    expect(s.products[0].reserved).toBe(0);
    expect(s.products[0].physical).toBe(120000);
  });
  it("reconciles dispatch and prevents invalid status changes", () => {
    let s = approved();
    s = reduce(s, { type: "order.create", id: s.quotes[0].id }, sales);
    const id = s.orders[0].id;
    expect(() =>
      reduce(s, { type: "order.status", id, status: "Dispatched" }, sales),
    ).toThrow();
    s = reduce(s, { type: "order.status", id, status: "Preparing" }, sales);
    s = reduce(s, { type: "order.status", id, status: "Dispatched" }, sales);
    expect(s.products[0].physical).toBe(100000);
    expect(s.products[0].reserved).toBe(0);
    expect(() =>
      reduce(
        s,
        { type: "order.status", id, status: "Cancelled", reason: "x" },
        sales,
      ),
    ).toThrow();
  });
  it("aggregates repeated products before stock checks and rolls back failure", () => {
    let s = quoted();
    s.products[0].physical = 30000;
    s.quotes[0].lines.push({ ...s.quotes[0].lines[0] });
    s = reduce(
      s,
      { type: "quote.approve", id: s.quotes[0].id, reason: "Review warning" },
      admin,
    );
    expect(() =>
      reduce(s, { type: "order.create", id: s.quotes[0].id }, sales),
    ).toThrow("not enough");
    expect(s.products[0].reserved).toBe(0);
  });
  it("requires stock adjustment reason and preserves reservations", () => {
    const s = approved();
    expect(() =>
      reduce(
        s,
        { type: "stock.adjust", id: "p0", physical: 2, reason: "" },
        admin,
      ),
    ).toThrow("reason");
    s.products[0].reserved = 1000;
    expect(() =>
      reduce(
        s,
        { type: "stock.adjust", id: "p0", physical: 500, reason: "count" },
        admin,
      ),
    ).toThrow("reserved");
  });
});
describe("CSV and matching", () => {
  it("validates duplicates, precision and rows before commit", () => {
    const p = previewCSV(
      "sku,name,category,unit,selling_price,stock\nNEW,Panel,Panel,pcs,100.00,2\nNEW,Panel,Panel,pcs,100,3\nBAD,Panel,Panel,pcs,1.001,2",
      "products",
      seed(),
    );
    expect(p.rows).toHaveLength(1);
    expect(p.errors.map((e) => e.row)).toEqual([3, 4]);
  });
  it("CSV handles quoted commas and rejects bad email", () => {
    const p = previewCSV(
      'company,contact,email\n"Example, Ltd",Person,a@example.test\nOther,Person,bad',
      "customers",
      seed(),
    );
    expect(p.rows).toHaveLength(1);
    expect(p.errors).toHaveLength(1);
  });
  it("neutralizes spreadsheet formulas on export", () => {
    const s = seed();
    s.customers[0].company = '=HYPERLINK("evil")';
    expect(customerCSV(s)).toContain("'=HYPERLINK");
  });
  it("shows ambiguous matches and missing quantity", () => {
    expect(match("mono panel", seed().products)).toHaveLength(2);
    expect(mockExtract("Need panels").items[0].quantity).toBeNull();
    expect(mockExtract("20 pcs panels").items[0].quantity).toBe("20");
  });
});
const config: AIConfig = {
  provider: "openai",
  key: "test-placeholder",
  model: "gpt-5.4-nano",
  inputRate: 0.05,
  outputRate: 0.4,
  timeoutMs: 10,
  outputTokens: 2000,
};
describe("AI boundary", () => {
  it("rejects malformed responses and oversized input", async () => {
    await expect(
      extract(
        "panels",
        config,
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"items":[]}' } }],
            }),
          ),
      ),
    ).rejects.toThrow("validation");
    await expect(extract("x".repeat(12001), config)).rejects.toThrow("12,000");
  });
  it("times out without unbounded retries", async () => {
    let calls = 0;
    const f: typeof fetch = async (_u, init) => {
      calls++;
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(Error("aborted"))),
      );
    };
    await expect(extract("panels", config, f)).rejects.toThrow("timed out");
    expect(calls).toBe(1);
  });
  it("parses strict valid output and captures token costs", async () => {
    const data = mockExtract("20 pcs panels");
    const r = await extract(
      "20 pcs panels",
      config,
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(data) } }],
            usage: { prompt_tokens: 100, completion_tokens: 200 },
          }),
        ),
    );
    expect(r.estimatedMicros).toBe(85);
    expect(r.inputTokens).toBe(100);
  });
});

it("filters explicit category/power evidence and preserves requested sets",()=>{
 expect(match("540 W panels",seed().products).map(x=>x.product.sku)).toEqual(["P-540"]);
 expect(match("999 W panels",seed().products)).toHaveLength(0);
 expect(mockExtract("2 sets mounting structures").items[0].unit).toBe("sets");
});
