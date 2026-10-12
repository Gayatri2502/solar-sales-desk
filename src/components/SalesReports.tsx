import { useState } from "react";
import { type State, localDay } from "../domain";
import { periodRange, type ReportPeriod } from "../reporting";
import ReportGraphs from "./ReportGraphs";
import { FieldInput } from "./shared";
export default function SalesReports({
  state,
  actorId,
}: {
  state: State;
  actorId: string;
}) {
  const today = localDay(new Date().toISOString(), state.settings.timezone),
    [period, setPeriod] = useState<ReportPeriod>("Monthly"),
    [anchor, setAnchor] = useState(today);
  const dates = periodRange(period, anchor || today);
  const enquiries = state.enquiries.filter((e) => e.assigned === actorId),
    ids = new Set(enquiries.map((e) => e.id)),
    quotes = state.quotes.filter((q) => ids.has(q.enquiryId)),
    qids = new Set(quotes.map((q) => q.id));
  const orders = state.orders.filter((o) => qids.has(o.quoteId)),
    orderIds = new Set(orders.map((o) => o.id));
  const own = {
    ...state,
    enquiries,
    quotes,
    orders,
    invoices: (state.invoices || []).filter((i) => orderIds.has(i.orderId)),
    callRecords: [],
    expenses: [],
  };
  return (
    <>
      <section className="panel">
        <h2>My sales report</h2>
        <p>
          Only enquiries currently assigned to you and their quotes/orders are
          included. Cost prices and business expenses are hidden.
        </p>
        <div className="toolbar">
          <label>
            Period
            <select
              aria-label="Sales report period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            >
              {["Weekly", "Monthly", "Yearly"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <FieldInput
            label="Sales report date"
            type="date"
            value={anchor}
            onChange={setAnchor}
          />
        </div>
        <p>
          {dates.from} → {dates.to}
        </p>
      </section>
      <ReportGraphs state={own} {...dates} admin={false} />
    </>
  );
}
