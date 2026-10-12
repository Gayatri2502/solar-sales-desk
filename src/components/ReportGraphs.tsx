import { graphData } from "../graphs";
import { type State, localDay, money } from "../domain";
import { summarize } from "../reporting";
import { Table } from "./shared";
export function BarGraph({
  title,
  rows,
  format = String,
  note,
}: {
  title: string;
  rows: { label: string; value: number }[];
  format?: (n: number) => string;
  note?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <section className="panel graph">
      <h2>{title}</h2>
      {note && <p className="muted">{note}</p>}
      {rows.length ? (
        <ul className="graph-bars">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="graph-label">
                <span>{r.label}</span>
                <strong>{format(r.value)}</strong>
              </div>
              <div className="graph-track" aria-hidden="true">
                <div
                  className={r.value < 0 ? "graph-fill negative" : "graph-fill"}
                  style={{ width: `${(100 * Math.abs(r.value)) / max}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No recorded data for this period.</p>
      )}
    </section>
  );
}
export default function ReportGraphs({
  state,
  from,
  to,
  admin = true,
}: {
  state: State;
  from: string;
  to: string;
  admin?: boolean;
}) {
  const g = graphData(state, from, to),
    r = summarize(state, from, to);
  const max = Math.max(
    1,
    ...g.trend.flatMap((b) => [b.enquiries, b.quotes, b.orders]),
  );
  const quality = [1, 2, 3, 4, 5].map((n) => ({
    label: `${n} / 5`,
    value: (state.callRecords || []).filter(
      (c) =>
        c.mode !== "Demo" &&
        c.outcome === "Answered" &&
        c.quality === n &&
        localDay(c.at, state.settings.timezone) >= from &&
        localDay(c.at, state.settings.timezone) <= to,
    ).length,
  }));
  return (
    <>
      <section className="panel graph">
        <h2>Sales activity over time</h2>
        <p className="muted">
          Creation dates in {state.settings.timezone}. New quotations exclude
          revisions. Won orders exclude cancellations. Each bar uses the same
          count scale.
        </p>
        <div className="graph-legend">
          <span className="enquiry-key">Enquiries</span>
          <span className="quote-key">Quotations</span>
          <span className="order-key">Orders</span>
        </div>
        <svg
          className="trend-chart"
          viewBox="0 0 720 190"
          role="img"
          aria-label="Enquiries, quotations and orders over the selected period. Exact values are available in the table below."
        >
          <line x1="30" y1="150" x2="700" y2="150" stroke="#c5ccd6" />
          <text x="4" y="22">
            {max}
          </text>
          <text x="4" y="153">
            0
          </text>
          {(["enquiries", "quotes", "orders"] as const).map((key, n) => (
            <polyline
              key={key}
              fill="none"
              stroke={["#002fa7", "#617690", "#20714c"][n]}
              strokeWidth="3"
              points={g.trend
                .map(
                  (b, j) =>
                    `${30 + (j * 670) / Math.max(1, g.trend.length - 1)},${150 - (130 * b[key]) / max}`,
                )
                .join(" ")}
            />
          ))}
          <text x="30" y="178">
            {from}
          </text>
          <text x="700" y="178" textAnchor="end">
            {to}
          </text>
        </svg>
        <details>
          <summary>View exact activity data</summary>
          <Table
            headers={[
              "Date",
              "Enquiries",
              "Quotations",
              "Orders",
              "Won order value",
            ]}
          >
            {g.trend.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                {(["enquiries", "quotes", "orders"] as const).map((k) => (
                  <td key={k}>
                    <div className="trend-cell">
                      <span>{b[k]}</span>
                      <span
                        aria-hidden="true"
                        className={"trend-bar " + k}
                        style={{ width: `${(80 * b[k]) / max}px` }}
                      />
                    </div>
                  </td>
                ))}
                <td>{money(b.value)}</td>
              </tr>
            ))}
          </Table>
        </details>
      </section>
      <div className="report-graphs">
        <BarGraph
          title="Enquiry conversion cohort"
          note="Enquiries created in this period, progressed to date. Later activity can change these counts."
          rows={[
            { label: "Enquiries captured", value: r.enquiries },
            { label: "Reached quotation", value: r.cohortQuoted },
            { label: "Reached order", value: r.cohortWon },
          ]}
        />
        <BarGraph
          title="Enquiry stages"
          note="Current stages of enquiries created in this period."
          rows={g.stages}
        />
        <BarGraph
          title="Product sales by category"
          note="Net product value after discount, before tax and delivery. Categories use the current catalogue."
          rows={g.categories}
          format={money}
        />
        <BarGraph
          title="Invoice approval and email status"
          note="Current status of invoices created in this period. Provider acceptance is not customer delivery or payment."
          rows={[...new Set((state.invoices || []).map((i) => i.status))].map(
            (label) => ({
              label,
              value: (state.invoices || []).filter(
                (i) =>
                  i.status === label &&
                  localDay(i.createdAt, state.settings.timezone) >= from &&
                  localDay(i.createdAt, state.settings.timezone) <= to,
              ).length,
            }),
          )}
        />
        <BarGraph
          title="Orders by salesperson"
          note="Non-cancelled orders created in this period; current enquiry assignment."
          rows={g.salespeople}
        />
        {admin && (
          <>
            <BarGraph
              title="Recorded call outcomes"
              note="Manual/live records only. Demo calls excluded."
              rows={[
                { label: "Answered", value: r.answered },
                { label: "Unattended / busy", value: r.unattended },
                { label: "Failed", value: r.failed },
              ]}
            />
            <BarGraph
              title="Reviewed call quality"
              note={`${r.reviewed} of ${r.answered} answered calls reviewed. Scores are human assessments.`}
              rows={quality}
            />
            <BarGraph
              title="Recorded expenses by category"
              note="Manual invoice records only. No records means unknown spending, not zero cost."
              rows={r.spendCategories.map((e) => ({
                label: e.category,
                value: e.amount,
              }))}
              format={money}
            />
            <BarGraph
              title="Product value and estimated costs"
              note="Gross margin excludes delivery costs and operating expenses. Missing costs remain unavailable."
              rows={[
                { label: "Product net value", value: r.net },
                ...(r.cost !== null
                  ? [{ label: "Product cost", value: r.cost }]
                  : []),
                ...(r.grossMargin !== null
                  ? [{ label: "Product gross margin", value: r.grossMargin }]
                  : []),
              ]}
              format={money}
            />
          </>
        )}
      </div>
    </>
  );
}
