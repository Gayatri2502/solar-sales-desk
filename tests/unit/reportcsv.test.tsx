// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Papa from "papaparse";
import { seed } from "../../src/seed";
import AdminReports from "../../src/components/AdminReports";
import { download } from "../../src/csv";
vi.mock("../../src/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/csv")>()),
  download: vi.fn(),
}));
afterEach(cleanup);
it("exports the selected period with exact recorded money and unknown-payment/quality coverage", () => {
  const s = seed();
  s.expenses = [
    {
      id: "x",
      category: "AI",
      date: "2026-10-05",
      amount: 12345,
      reference: "synthetic",
      notes: "",
      createdAt: "2026-10-05T01:00:00Z",
      recordedBy: "demo-admin",
    },
  ];
  render(<AdminReports state={s} run={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Date within report period"), {
    target: { value: "2026-10-05" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export report CSV" }));
  const csv = vi.mocked(download).mock.calls.at(-1)![1];
  const rows = Papa.parse<Record<string, string>>(csv, { header: true }).data;
  expect(rows.find((x) => x.metric === "Expenses recorded")?.value).toBe(
    "₹123.45",
  );
  expect(rows.find((x) => x.metric === "cashCollected")?.value).toBe(
    "Not tracked",
  );
  expect(rows.find((x) => x.metric === "Call quality")?.value).toBe(
    "Not reviewed",
  );
  expect(
    rows.every(
      (x) =>
        x.from === "2026-10-01" &&
        x.to === "2026-10-31" &&
        x.timezone === "Asia/Kolkata",
    ),
  ).toBe(true);
});
