import { describe, it, expect, vi } from "vitest";
import { seed } from "../../src/seed";
import { reduce, type State, visibleState } from "../../src/domain";
import { invoiceHTML } from "../../src/invoices";
import { sendInvoice } from "../../server/invoice-delivery";
import { graphData } from "../../src/graphs";
const admin = { id: "demo-admin", role: "admin" as const },
  sales = { id: "demo-sales", role: "sales" as const };
const at = "2026-10-05T04:00:00Z";
export function ordered() {
  let s = seed();
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
    at,
  );
  s = reduce(
    s,
    {
      type: "quote.approve",
      id: s.quotes[0].id,
      reason: "Reviewed synthetic stock",
    },
    admin,
    at,
  );
  return reduce(s, { type: "order.create", id: s.quotes[0].id }, sales, at);
}
function approved(s = ordered()) {
  s = reduce(s, { type: "invoice.submit", id: s.invoices![0].id }, sales, at);
  return reduce(
    s,
    { type: "invoice.approve", id: s.invoices![0].id },
    admin,
    at,
  );
}
describe("invoice event gates", () => {
  it("creates exactly one private-free invoice with the accepted order; prevents duplicate conversion/backfill", () => {
    const s = ordered(),
      i = s.invoices![0];
    expect(i.total).toBe(s.orders[0].total);
    expect(i.lines[0]).not.toHaveProperty("cost");
    expect(s.events.filter((e) => e.type === "invoice.created")).toHaveLength(
      1,
    );
    expect(() =>
      reduce(s, { type: "order.create", id: s.quotes[0].id }, sales, at),
    ).toThrow("already");
    expect(() =>
      reduce(s, { type: "invoice.create", orderId: s.orders[0].id }, sales, at),
    ).toThrow("already");
    expect(visibleState(s, "sales").invoices).toEqual(s.invoices);
  });
  it("blocks sales approval and sending before approval; incomplete customer/business blocks submit", () => {
    const s = ordered(),
      id = s.invoices![0].id;
    expect(() => reduce(s, { type: "invoice.approve", id }, sales, at)).toThrow(
      "admin",
    );
    expect(() =>
      reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at),
    ).toThrow("approval");
    s.invoices![0].customer.email = "";
    expect(() => reduce(s, { type: "invoice.submit", id }, sales, at)).toThrow(
      "Complete",
    );
  });
  it("editing approval creates a draft revision and removes approval; stale approval clicks reject", () => {
    let s = approved();
    const i = s.invoices![0];
    s = reduce(
      s,
      {
        type: "invoice.edit",
        id: i.id,
        patch: {
          email: "updated@example.test",
          address: "Synthetic Pune",
          gstin: "",
          terms: "Reviewed terms",
          notes: "",
        },
      },
      sales,
      at,
    );
    expect(s.invoices![0]).toMatchObject({
      revision: 2,
      status: "Draft",
      approvedBy: "",
      approvedAt: "",
    });
    expect(() =>
      reduce(s, { type: "invoice.approve", id: i.id }, admin, at),
    ).toThrow("Submit");
    expect(() =>
      reduce(s, { type: "invoice.claim", id: i.id, lease: "a" }, admin, at),
    ).toThrow("approval");
  });
  it("cancellation voids queued invoice and blocks subsequent approval/delivery", () => {
    let s = approved(),
      id = s.invoices![0].id;
    s = reduce(
      s,
      {
        type: "order.status",
        id: s.orders[0].id,
        status: "Cancelled",
        reason: "Synthetic cancellation",
      },
      sales,
      at,
    );
    expect(s.invoices![0].status).toBe("Voided");
    expect(() =>
      reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at),
    ).toThrow("Cancelled");
    expect(s.products[0].reserved).toBe(0);
  });
  it("delivery lease excludes concurrent claims and stale completions; bounded retries and no edits/cancellation after attempts", () => {
    let s = approved(),
      id = s.invoices![0].id;
    s = reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at);
    expect(() =>
      reduce(s, { type: "invoice.claim", id, lease: "b" }, admin, at),
    ).toThrow("in progress");
    expect(() =>
      reduce(
        s,
        { type: "invoice.complete", id, lease: "b", providerId: "x" },
        admin,
        at,
      ),
    ).toThrow("lease");
    expect(() =>
      reduce(
        s,
        {
          type: "order.status",
          id: s.orders[0].id,
          status: "Cancelled",
          reason: "x",
        },
        sales,
        at,
      ),
    ).toThrow("delivery");
    s = reduce(s, { type: "invoice.fail", id, lease: "a" }, admin, at);
    expect(() =>
      reduce(s, { type: "invoice.edit", id, patch: {} }, sales, at),
    ).toThrow("cannot be changed");
    for (let n = 2; n <= 3; n++) {
      s = reduce(s, { type: "invoice.claim", id, lease: String(n) }, admin, at);
      s = reduce(s, { type: "invoice.fail", id, lease: String(n) }, admin, at);
    }
    expect(() =>
      reduce(s, { type: "invoice.claim", id, lease: "4" }, admin, at),
    ).toThrow("exhausted");
  });
  it("successful delivery records acceptance once; uncertain old delivery cannot retry past 23 hours", () => {
    let s = approved(),
      id = s.invoices![0].id;
    s = reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at);
    expect(() =>
      reduce(
        s,
        { type: "invoice.claim", id, lease: "b" },
        admin,
        "2026-10-06T04:00:00Z",
      ),
    ).toThrow("exhausted");
    s = reduce(
      s,
      { type: "invoice.complete", id, lease: "a", providerId: "email-1" },
      admin,
      at,
    );
    expect(s.invoices![0]).toMatchObject({
      status: "Sent",
      providerId: "email-1",
    });
    expect(() =>
      reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at),
    ).toThrow("approval");
  });
});
describe("provider boundary and graphs", () => {
  it("uses stable idempotency key and escaped invoice HTML without private costs; no provider call before approval/config", async () => {
    let s = approved(),
      id = s.invoices![0].id;
    const transport = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    const env = {
      INVOICE_EMAIL_ENABLED: "true",
      RESEND_API_KEY: "test-placeholder",
      INVOICE_FROM_EMAIL: "invoices@example.test",
    };
    await expect(
      sendInvoice(s.invoices![0], "tenant-a", env, transport),
    ).rejects.toThrow("lease");
    expect(transport).not.toHaveBeenCalled();
    s = reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at);
    s.invoices![0].notes = "<script>danger</script>";
    expect(await sendInvoice(s.invoices![0], "tenant-a", env, transport)).toBe(
      "email-1",
    );
    const opts = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(
      (opts[1].headers as Record<string, string>)["Idempotency-Key"],
    ).toContain(`tenant-a/${id}/1`);
    const html = invoiceHTML(s.invoices![0]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/8900|margin|cost price/i);
    await expect(
      sendInvoice(s.invoices![0], "tenant-a", {}, transport),
    ).rejects.toThrow("configured");
  });
  it("handles provider rejection, malformed response and timeout without declaring sent", async () => {
    const s = approved(),
      id = s.invoices![0].id;
    const i = reduce(s, { type: "invoice.claim", id, lease: "a" }, admin, at)
      .invoices![0];
    const env = {
      INVOICE_EMAIL_ENABLED: "true",
      RESEND_API_KEY: "x",
      INVOICE_FROM_EMAIL: "x@example.test",
    };
    for (const mock of [
      vi.fn(async () => new Response("{}", { status: 429 })),
      vi.fn(async () => new Response("{}", { status: 200 })),
      vi.fn(async () => {
        throw new Error("Timeout");
      }),
    ])
      await expect(sendInvoice(i, "tenant-a", env, mock)).rejects.toThrow();
  });
  it("graph buckets attribute exact category value and exclude revisions/cancellations", () => {
    let s = ordered();
    s.quotes.push({ ...s.quotes[0], id: "revision", revision: 2 });
    const g = graphData(s, "2026-10-01", "2026-10-31");
    expect(g.trend).toHaveLength(31);
    expect(g.trend.find((b) => b.label === "2026-10-05")).toMatchObject({
      quotes: 1,
      orders: 1,
      value: s.orders[0].total,
    });
    expect(g.categories).toEqual([
      { label: "Panel", value: s.orders[0].total },
    ]);
    s = reduce(
      s,
      {
        type: "order.status",
        id: s.orders[0].id,
        status: "Cancelled",
        reason: "Test",
      },
      sales,
      at,
    );
    expect(graphData(s, "2026-01-01", "2026-12-31").categories).toEqual([]);
  });
});
