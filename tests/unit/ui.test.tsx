// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import App from "../../src/App";
import { seed } from "../../src/seed";
import { reduce } from "../../src/domain";
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] || null,
      get length() {
        return values.size;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  location.hash = "";
});
describe("rendered business workflow", () => {
  it("opens created quotation without navigation losing selection", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: /Enquiries/ }));
    const row = screen.getByText("Aarav Energy · Demo").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Review" }));
    fireEvent.change(screen.getByLabelText("Catalogue product for item 1"), {
      target: { value: "p0" },
    });
    fireEvent.change(screen.getByLabelText("Catalogue product for item 2"), {
      target: { value: "p2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft quotation" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Quotation builder" }),
    ).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(
      screen.getByRole("heading", { name: "Quotation builder" }),
    ).toBeTruthy();
  });
  it("customer document excludes all cost and margin values", async () => {
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
      { id: "demo-admin", role: "admin" },
    );
    window.localStorage.setItem("ssd.synthetic.v1", JSON.stringify(s));
    location.hash = "Quotations";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open quote" }));
    const doc = document.querySelector(".customer-document")!;
    expect(doc.textContent).toContain("₹2,08,000.00");
    expect(doc.textContent).not.toMatch(/cost|margin|₹8,900|₹1,78,000/i);
  });
  it("sales has no product-cost column or management action", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Demo role"), {
      target: { value: "sales" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Products & Stock" }));
    expect(screen.queryByRole("columnheader", { name: /^Cost$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add product" })).toBeNull();
  });
});

it("shows admin reports with calendar filters and prevents sales from opening financial reports", () => {
  location.hash = "Reports";
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Admin performance report" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Report period"), {
    target: { value: "Yearly" },
  });
  expect(screen.getByText(/2026-01-01 → 2026-12-31/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Demo role"), {
    target: { value: "sales" },
  });
  expect(
    screen.queryByRole("heading", { name: "Admin performance report" }),
  ).toBeNull();
  expect(screen.queryByRole("link", { name: /^Reports$/ })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Business admin");
});

it("sales submits an order invoice, admin approval triggers only labeled demo delivery", async () => {
  let s = seed();
  s.settings.taxBps = 0;
  s.settings.deliveryTaxBps = 0;
  const actor = { id: "demo-admin", role: "admin" as const };
  s = reduce(
    s,
    {
      type: "quote.create",
      enquiryId: s.enquiries[1].id,
      selections: [{ productId: "p0", quantity: "2" }],
    },
    actor,
  );
  s = reduce(
    s,
    { type: "quote.approve", id: s.quotes[0].id, reason: "Synthetic review" },
    actor,
  );
  s = reduce(s, { type: "order.create", id: s.quotes[0].id }, actor);
  window.localStorage.setItem("ssd.synthetic.v1", JSON.stringify(s));
  location.hash = "Invoices";
  render(<App />);
  fireEvent.change(screen.getByLabelText("Demo role"), {
    target: { value: "sales" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review invoice" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Submit for admin approval" }),
  );
  expect(await screen.findByText("Pending approval")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Approve and simulate email" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Print approved invoice / PDF" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Demo role"), {
    target: { value: "admin" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Approve and simulate email" }),
  );
  expect(await screen.findByText("Demo sent")).toBeTruthy();
  expect(screen.getByText(/Synthetic email simulation completed/)).toBeTruthy();
  expect(document.querySelector(".customer-document")!.textContent).not.toMatch(
    /Internal cost|margin|₹8,900/,
  );
});

it("sales graphs include their own cohort and exclude private financial graphs", () => {
  location.hash = "My%20Reports";
  render(<App />);
  fireEvent.change(screen.getByLabelText("Demo role"), {
    target: { value: "sales" },
  });
  expect(screen.getByRole("heading", { name: "My sales report" })).toBeTruthy();
  expect(
    screen.getByRole("img", { name: /Enquiries, quotations and orders/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Recorded expenses by category" }),
  ).toBeNull();
  expect(
    screen.queryByRole("heading", {
      name: "Product value and estimated costs",
    }),
  ).toBeNull();
});
