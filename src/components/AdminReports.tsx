import ReportGraphs from "./ReportGraphs";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { type State, money, minor, localDay } from "../domain";
import {
  summarize,
  periodRange,
  type ReportPeriod,
  type AIReportDay,
} from "../reporting";
import { live, request } from "../api";
import { download } from "../csv";
import { scheduledInstant, callTime } from "../leads";
import { Button } from "./ui/button";
import { FieldInput, Table, type Run } from "./shared";
export default function AdminReports({
  state,
  run,
}: {
  state: State;
  run: Run;
}) {
  const today = localDay(new Date().toISOString(), state.settings.timezone);
  const [period, setPeriod] = useState<ReportPeriod>("Monthly");
  const [anchor, setAnchor] = useState(today);
  const [aiDays, setAI] = useState<AIReportDay[] | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dates = periodRange(period, anchor || today);
  const from = dates.from,
    to = dates.to;
  useEffect(() => {
    if (!live) return;
    let active = true;
    setLoading(true);
    setAI(undefined);
    setError("");
    request("/report-usage", { from, to })
      .then((d) => {
        if (active) setAI(d.days);
      })
      .catch(() => {
        if (active)
          setError(
            "AI usage report unavailable. Spending estimates may be incomplete.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from, to]);
  const aiAvailable = !live || aiDays !== undefined;
  const r = summarize(
    state,
    dates.from,
    dates.to,
    live ? aiDays || [] : undefined,
  );
  const pct = (n: number | null) =>
    n === null ? "—" : (100 * n).toFixed(1) + "%";
  const [call, setCall] = useState({
    customerId: state.customers[0]?.id || "",
    at: "",
    outcome: "Answered",
    duration: "",
    reference: "",
    cost: "",
    quality: "",
    notes: "",
  });
  const [expense, setExpense] = useState({
    category: "Telephony",
    date: today,
    amount: "",
    reference: "",
    notes: "",
  });
  const cards = [
    ["Enquiries captured", String(r.enquiries)],
    ["New quotations", String(r.quotes)],
    ["Deals won / orders", String(r.orders)],
    ["Cancelled orders", String(r.cancelled)],
    ["Enquiry → quotation", pct(r.quoteConversion)],
    ["Enquiry → order", pct(r.dealConversion)],
    ["Won order value", money(r.orderValue)],
    [
      "Product sales before tax",
      r.unknownAmounts ? "Incomplete" : money(r.net),
    ],
    ["Estimated product cost", r.cost === null ? "Incomplete" : money(r.cost)],
    [
      "Estimated product gross margin",
      r.grossMargin === null ? "Unavailable" : money(r.grossMargin),
    ],
    ["Calls placed (recorded)", String(r.calls)],
    ["Calls answered", String(r.answered)],
    ["Unattended / busy", String(r.unattended)],
    ["Failed calls", String(r.failed)],
    [
      "Call quality",
      r.quality === null ? "Not reviewed" : r.quality.toFixed(1) + " / 5",
    ],
    [
      "Expenses recorded",
      r.spending === null ? "Not recorded" : money(r.spending),
    ],
  ];
  const csvRows = () => [
    ...cards.map(([metric, value]) => ({
      from: dates.from,
      to: dates.to,
      timezone: state.settings.timezone,
      metric,
      value,
    })),
    ...Object.entries({
      quotationRevisions: r.revisions,
      cohortQuoted: r.cohortQuoted,
      cohortWon: r.cohortWon,
      reviewedCalls: r.reviewed,
      simulatedCalls: r.simulated,
      answeredTalkSeconds: r.talkSeconds,
      deliveryChargePaise: r.delivery,
      taxPaise: r.tax,
      missingCostOrders: r.missingCostOrders,
      unknownCallCosts: r.unknownCallCosts,
      aiRequests: aiAvailable ? r.ai.requests : "Unavailable",
      aiInputTokens: aiAvailable ? r.ai.input : "Unavailable",
      aiOutputTokens: aiAvailable ? r.ai.output : "Unavailable",
      aiEstimatedUSD: aiAvailable
        ? (r.ai.micros / 1e6).toFixed(6)
        : "Unavailable",
      cashCollected: "Not tracked",
      expenseCoverage: "Manual records only; completeness not verified",
      aiCoverage: live
        ? aiDays
          ? "Complete requested range"
          : "Unavailable"
        : "Synthetic local ledger",
      snapshot:
        "Current status at export; prior reports may change after cancellations",
    }).map(([metric, value]) => ({
      from: dates.from,
      to: dates.to,
      timezone: state.settings.timezone,
      metric,
      value: String(value),
    })),
  ];
  return (
    <>
      <section className="panel">
        <h2>Admin performance report</h2>
        <div className="toolbar">
          <label>
            Period
            <select
              aria-label="Report period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            >
              {["Weekly", "Monthly", "Yearly"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <FieldInput
            label="Date within report period"
            type="date"
            value={anchor}
            onChange={setAnchor}
          />
          <Button
            variant="outline"
            onClick={() =>
              download(
                `solar-report-${dates.from}-${dates.to}.csv`,
                Papa.unparse(csvRows(), { escapeFormulae: true }),
                "text/csv",
              )
            }
          >
            Export report CSV
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download(
                `solar-report-${dates.from}-${dates.to}.json`,
                JSON.stringify(
                  {
                    generatedAt: new Date().toISOString(),
                    period,
                    ...dates,
                    timezone: state.settings.timezone,
                    coverage: csvRows().slice(cards.length),
                    summary: r,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Export report JSON
          </Button>
        </div>
        <p>
          <strong>
            {dates.from} → {dates.to}
          </strong>{" "}
          · {state.settings.timezone} · Current records/statuses; this period
          can still be in progress.
        </p>
        <p>
          Weekly means Monday–Sunday; monthly/yearly use calendar boundaries.
          New quotes count distinct quotation numbers once, not revisions.
          Conversion is the selected enquiry cohort's progress to date,
          including later quotes/orders. Activity counts use each record's
          creation date.
        </p>
      </section>
      <ReportGraphs state={state} from={dates.from} to={dates.to} />
      <div className="stats">
        {cards.map(([label, value]) => (
          <div className="panel" key={label}>
            <small>{label}</small>
            <h2>{value}</h2>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>Revenue and costing detail</h2>
        <p>
          Won order value is non-cancelled orders created in the period,
          including taxes and delivery. It is{" "}
          <strong>not cash collected or accounting revenue recognition</strong>.
          Cash collected is not tracked.
        </p>
        <Table headers={["Metric", "Amount / coverage"]}>
          <tr>
            <td>Product sales after discounts, before tax</td>
            <td>
              {money(r.net)}
              {r.unknownAmounts ? " · partial" : ""}
            </td>
          </tr>
          <tr>
            <td>Customer delivery charges (not a delivery expense)</td>
            <td>{money(r.delivery)}</td>
          </tr>
          <tr>
            <td>Configured quotation tax</td>
            <td>{money(r.tax)}</td>
          </tr>
          <tr>
            <td>Known estimated product cost (order snapshot)</td>
            <td>
              {money(r.knownCost)} · {r.missingCostOrders} orders missing cost
            </td>
          </tr>
          <tr>
            <td>
              Estimated product gross margin, excluding delivery/tax/operating
              costs
            </td>
            <td>
              {r.grossMargin === null
                ? "Unavailable until missing costs are supplied"
                : money(r.grossMargin)}
            </td>
          </tr>
          <tr>
            <td>Cash collected</td>
            <td>Not tracked</td>
          </tr>
        </Table>
        <p>
          Product costs are estimates copied from quotations, not supplier
          invoices or a verified cost-of-goods ledger. Missing costs make total
          cost and margin unavailable; known partial cost remains visible.
        </p>
      </section>
      <section className="panel">
        <h2>Calls and conversation quality</h2>
        <p>
          Recorded manual and live provider calls are counted as placed. Unattended means
          Unanswered or Busy; failed calls are separate. Cancelled appointments
          are not placed calls. {r.simulated} simulated calls are excluded from
          real volume, cost and quality.
        </p>
        <p>
          Answer rate: {r.calls ? pct(r.answered / r.calls) : "—"} · Answered
          talk time: {(r.talkSeconds / 60).toFixed(1)} minutes · Quality
          coverage: {r.reviewed} / {r.answered} answered calls reviewed.
        </p>
        <p>
          Quality is a human review score: 1 inaccurate/unusable, 2 major gaps,
          3 usable with corrections, 4 clear and mostly complete, 5 accurate and
          complete. It is not an automatically verified customer satisfaction
          score.
        </p>
        <Table
          headers={[
            "Time / reference",
            "Customer",
            "Outcome",
            "Talk time",
            "Quality",
            "Call charge (informational)",
          ]}
        >
          {(state.callRecords || [])
            .filter((c) => {
              const day = localDay(c.at, state.settings.timezone);
              return day >= dates.from && day <= dates.to;
            })
            .map((c) => (
              <tr key={c.id}>
                <td>
                  {callTime(c.at, state.settings.timezone)}
                  <small>
                    {c.reference} · {c.mode}
                  </small>
                </td>
                <td>
                  {state.customers.find((x) => x.id === c.customerId)?.company}
                </td>
                <td>{c.outcome}</td>
                <td>{c.durationSeconds}s</td>
                <td>
                  {c.quality === null ? "Not reviewed" : c.quality + " / 5"}
                </td>
                <td>{c.cost === null ? "Not supplied" : money(c.cost)}</td>
              </tr>
            ))}
        </Table>
        <p>
          Per-call charges are informational and are not added to expenses
          again. Record provider invoices under expenses to avoid double
          counting. {r.unknownCallCosts} placed calls have unknown charges.
        </p>
      </section>
      <section className="panel">
        <h2>Spending and AI usage</h2>
        <p>
          Recorded expenses:{" "}
          {r.spending === null ? "Not recorded" : money(r.spending)}. Manual
          invoice entries are not independently verified or necessarily
          complete. Call charges and AI estimates are shown separately and never
          silently added to invoices.
        </p>
        <Table headers={["Category", "Recorded INR expense"]}>
          {r.spendCategories.map((e) => (
            <tr key={e.category}>
              <td>{e.category}</td>
              <td>{money(e.amount)}</td>
            </tr>
          ))}
        </Table>
        <Table
          headers={["Invoice date", "Category", "Reference", "Recorded amount"]}
        >
          {r.expenses.map((e) => (
            <tr key={e.id}>
              <td>{e.date}</td>
              <td>{e.category}</td>
              <td>{e.reference}</td>
              <td>{money(e.amount)}</td>
            </tr>
          ))}
        </Table>
        <p>
          AI requests: {live && !aiDays ? "Unavailable" : r.ai.requests} · Input
          tokens: {aiAvailable ? r.ai.input : "Unavailable"} · Output tokens:{" "}
          {aiAvailable ? r.ai.output : "Unavailable"} · Estimated provider cost:{" "}
          {live && !aiDays
            ? "Unavailable"
            : "USD " + (r.ai.micros / 1e6).toFixed(4)}{" "}
          · Failed requests: {aiAvailable ? r.ai.failed : "Unavailable"}
        </p>
        <p>
          Live AI usage is aggregated for the full selected business-timezone
          period. Pending requests conservatively reserve spending. Estimates
          may lag provider billing; costs stay in USD until an actual INR bill
          is recorded. Hosting/database/WhatsApp/telephony costs need invoice
          entries until their providers are connected.
        </p>
        {loading ? (
          <p role="status">Loading AI usage for this period…</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </section>
      <section className="panel">
        <h2>Record a completed manual call</h2>
        <p>
          Use your actual call log. Recording this outcome does not place a
          call. Leave charge/quality blank when unknown.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const next = await run({
                type: "report.call",
                record: {
                  customerId: call.customerId,
                  leadId: "",
                  at: scheduledInstant(call.at, state.settings.timezone),
                  mode: "Manual",
                  outcome: call.outcome,
                  durationSeconds: Number(call.duration || 0),
                  reference: call.reference,
                  cost: call.cost ? minor(call.cost) : null,
                  quality: call.quality ? Number(call.quality) : null,
                  notes: call.notes,
                },
              });
              if (next)
                setCall({
                  ...call,
                  reference: "",
                  cost: "",
                  quality: "",
                  notes: "",
                });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Customer
              <select
                aria-label="Call report customer"
                value={call.customerId}
                onChange={(e) =>
                  setCall({ ...call, customerId: e.target.value })
                }
              >
                <option value="">Select customer</option>
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
              </select>
            </label>
            <FieldInput
              label={"Completed call time (" + state.settings.timezone + ")"}
              type="datetime-local"
              value={call.at}
              onChange={(at) => setCall({ ...call, at })}
            />
            <label>
              Outcome
              <select
                aria-label="Recorded call outcome"
                value={call.outcome}
                onChange={(e) =>
                  setCall({
                    ...call,
                    outcome: e.target.value,
                    duration: "",
                    quality: "",
                  })
                }
              >
                {["Answered", "Unanswered", "Busy", "Failed", "Cancelled"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            <FieldInput
              label="Answered talk duration (seconds)"
              type="number"
              min={0}
              value={call.duration}
              onChange={(duration) => setCall({ ...call, duration })}
            />
            <FieldInput
              label="Unique call log reference"
              value={call.reference}
              onChange={(reference) => setCall({ ...call, reference })}
            />
            <FieldInput
              label="Call charge INR (optional)"
              value={call.cost}
              onChange={(cost) => setCall({ ...call, cost })}
            />
            <FieldInput
              label="Human quality score 1–5 (optional)"
              type="number"
              min={1}
              value={call.quality}
              onChange={(quality) => setCall({ ...call, quality })}
            />
            <FieldInput
              label="Call review notes"
              value={call.notes}
              onChange={(notes) => setCall({ ...call, notes })}
            />
          </div>
          <Button disabled={!call.customerId || !call.at || !call.reference}>
            Record call outcome
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>Record a provider or operating expense</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const next = await run({
                type: "report.expense",
                expense: { ...expense, amount: minor(expense.amount) },
              });
              if (next)
                setExpense({
                  ...expense,
                  amount: "",
                  reference: "",
                  notes: "",
                });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Expense category
              <select
                aria-label="Expense category"
                value={expense.category}
                onChange={(e) =>
                  setExpense({ ...expense, category: e.target.value })
                }
              >
                {[
                  "Telephony",
                  "WhatsApp",
                  "AI",
                  "Hosting",
                  "Database",
                  "Storage",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <FieldInput
              label="Expense invoice date"
              type="date"
              value={expense.date}
              onChange={(date) => setExpense({ ...expense, date })}
            />
            <FieldInput
              label="Billed amount INR"
              value={expense.amount}
              onChange={(amount) => setExpense({ ...expense, amount })}
            />
            <FieldInput
              label="Unique invoice reference"
              value={expense.reference}
              onChange={(reference) => setExpense({ ...expense, reference })}
            />
            <FieldInput
              label="Expense notes"
              value={expense.notes}
              onChange={(notes) => setExpense({ ...expense, notes })}
            />
          </div>
          <Button
            disabled={!expense.date || !expense.amount || !expense.reference}
          >
            Record expense
          </Button>
        </form>
      </section>
    </>
  );
}
