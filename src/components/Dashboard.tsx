import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Users,
  Package,
  Truck,
  Settings,
  Sun,
  Plus,
  ArrowUpRight,
  Search,
  Download,
  LogOut,
} from "lucide-react";
import {
  type State,
  type Quote,
  type Enquiry,
  type Line,
  type Extraction,
  type Product,
  type Customer,
  type Command,
  uid,
  minor,
  qty,
  totals,
  money,
  localDay,
  match,
  mockExtract,
  warnings,
  categories,
  stages,
} from "../domain";
import {
  loadDemo,
  command,
  live,
  auth,
  request,
  demoVisible,
  resetDemo,
  type Session,
} from "../api";
import { seed } from "../seed";
import { previewCSV, customerCSV, download, type Preview } from "../csv";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { FieldInput, Tag, Table, Empty, safeTotal, type Run } from "./shared";
export default function Dashboard({
  state,
  due,
  drafts,
  value,
  won,
  admin,
  callingConfigured,
  onEnquiry,
  onPage,
}: {
  state: State;
  due: Enquiry[];
  drafts: Quote[];
  value: number;
  won: State["orders"];
  admin: boolean;
  callingConfigured: boolean;
  onEnquiry: (id: string) => void;
  onPage: (s: string) => void;
}) {
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(
    localDay(new Date().toISOString(), state.settings.timezone),
  );
  const inDate = (s: string) => {
    const day = localDay(s, state.settings.timezone);
    return day >= from && day <= to;
  };
  const qs = state.quotes.filter((q) => q.sentAt && inDate(q.sentAt));
  const os = won.filter((o) => inDate(o.createdAt));
  const conversion = qs.length
    ? Math.round(
        (qs.filter((q) => os.some((o) => o.quoteId === q.id)).length /
          qs.length) *
          100,
      )
    : null;
  const prep = state.events
    .filter((e) => e.type === "quote.approved" && inDate(e.at))
    .map((e) => e.value || 0)
    .sort((a, b) => a - b);
  const followups = (state.followups || []).filter(
    (f) =>
      f.due >= from &&
      f.due <= to &&
      f.due <= localDay(new Date().toISOString(), state.settings.timezone),
  );
  const drafted = state.quotes.filter(
    (q) => q.revision === 1 && inDate(q.createdAt),
  );
  const median = prep.length
    ? (prep[Math.floor((prep.length - 1) / 2)] +
        prep[Math.ceil((prep.length - 1) / 2)]) /
      2
    : null;
  const weekly = new Set(
    state.events
      .filter(
        (e) =>
          e.type === "activity" &&
          Date.parse(e.at) > Date.now() - 7 * 86400000 &&
          state.users.some((u) => u.id === e.user && u.role === "sales"),
      )
      .map((e) => e.user),
  ).size;
  const shortages = state.quotes
    .filter(
      (q) =>
        !["Superseded"].includes(q.status) &&
        !state.orders.some((o) => o.quoteId === q.id),
    )
    .flatMap((q) =>
      q.lines
        .filter((l) => {
          const p = state.products.find((p) => p.id === l.productId);
          return p && p.physical - p.reserved < qty(l.quantity);
        })
        .map((l) => `${q.number}: ${l.sku}`),
    );
  const callsDue = (state.leads || []).filter(
    (lead) =>
      lead.status === "Scheduled" &&
      lead.callConsent &&
      Date.parse(lead.scheduledAt) <= Date.now(),
  ).length;
  return (
    <>
      <div className="stats">
        <button onClick={() => onPage("Enquiries")}>
          <span>Enquiries awaiting action</span>
          <strong>
            {
              state.enquiries.filter((e) => !["Won", "Lost"].includes(e.status))
                .length
            }
          </strong>
          <small>
            Open enquiries, all dates <ArrowUpRight aria-hidden />
          </small>
        </button>
        <button onClick={() => onPage("Quotations")}>
          <span>Awaiting approval</span>
          <strong>{drafts.length.toString().padStart(2, "0")}</strong>
          <small>
            Current draft revisions <ArrowUpRight aria-hidden />
          </small>
        </button>
        <button onClick={() => onPage("Enquiries")}>
          <span>Follow-ups due</span>
          <strong>{due.length.toString().padStart(2, "0")}</strong>
          <small>
            Due today or overdue <ArrowUpRight aria-hidden />
          </small>
        </button>
        <button onClick={() => onPage("Quotations")}>
          <span>Open quotation value</span>
          <strong className="money-stat">{money(value)}</strong>
          <small>
            Approved/sent, excluding orders <ArrowUpRight aria-hidden />
          </small>
        </button>
      </div>
      <section className={`dashboard-actions${admin ? " dashboard-actions-admin" : ""}`} aria-label="Priority actions">
        <div className="dashboard-action-card">
          <div>
            <span className="eyebrow">CALL QUEUE</span>
            <h2>{callsDue} agreed {callsDue === 1 ? "call" : "calls"} due</h2>
            <p>{callingConfigured ? "Calls need recorded consent, an agreed time, provider access and available allowance." : "Calls are disabled until a calling provider is connected and verified."}</p>
          </div>
          <Button variant="outline" onClick={() => onPage("Leads & Calls")}>Review calls</Button>
        </div>
        {admin ? <div className="dashboard-action-card dashboard-report-action">
          <div>
            <span className="eyebrow">ADMIN REPORTS</span>
            <h2>Sales, call quality and spend</h2>
            <p>Review enquiry conversion, won order value, margins, call outcomes and recorded costs.</p>
          </div>
          <Button onClick={() => onPage("Reports")}>Open reports</Button>
        </div> : null}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Follow up next</h2>
            <Tag text={`${due.length} due`} />
          </div>
          <Table headers={["Customer", "Next action", "Due", ""]}>
            {due.slice(0, 8).map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>
                    {
                      state.customers.find((c) => c.id === e.customerId)
                        ?.company
                    }
                  </strong>
                  <small>{e.status}</small>
                </td>
                <td>{e.nextAction}</td>
                <td className="overdue">{e.due}</td>
                <td>
                  <Button variant="outline" onClick={() => onEnquiry(e.id)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          {!due.length ? (
            <Empty text="You're up to date. Set the next action and due date on each enquiry." />
          ) : null}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Pipeline</h2>
            <span className="muted">All enquiries</span>
          </div>
          <div className="pipeline">
            {stages.map((stage) => {
              const n = state.enquiries.filter(
                (e) => e.status === stage,
              ).length;
              return (
                <div key={stage}>
                  <span>{stage}</span>
                  <div className="bar">
                    <span
                      style={{
                        width: `${state.enquiries.length ? (n / state.enquiries.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{n}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Performance & pilot measurements</h2>
          <div className="toolbar">
            <label>
              From{" "}
              <input
                aria-label="Metric start date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To{" "}
              <input
                aria-label="Metric end date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="metric-grid">
          <div>
            <strong>{money(os.reduce((n, o) => n + o.total, 0))}</strong>
            <span>Won order value</span>
            <small>
              Non-cancelled orders created in range. This is not cash collected.
            </small>
          </div>
          <div>
            <strong>{conversion === null ? "—" : conversion + "%"}</strong>
            <span>Quote-to-order conversion</span>
            <small>
              Sent quotes in range with a non-cancelled order created in range /
              sent quotes in range.
            </small>
          </div>
          <div>
            <strong>
              {median === null ? "—" : median.toFixed(1) + " min"}
            </strong>
            <span>Median quotation preparation</span>
            <small>
              Elapsed enquiry capture to each approval in range; includes
              waiting time.
            </small>
          </div>
          <div>
            <strong>
              {followups.length
                ? Math.round(
                    (followups.filter(
                      (f) =>
                        f.completedAt &&
                        localDay(f.completedAt, state.settings.timezone) <=
                          f.due,
                    ).length /
                      followups.length) *
                      100,
                  ) + "%"
                : "—"}
            </strong>
            <span>Follow-ups completed on time</span>
            <small>
              Scheduled follow-ups due in range completed by their due day / all
              follow-ups due in range, including missed ones.
            </small>
          </div>
          <div>
            <strong>
              {drafted.length
                ? Math.round(
                    (drafted.filter((q) =>
                      state.events.some(
                        (e) =>
                          e.type === "draft.corrected" &&
                          e.entity === q.enquiryId,
                      ),
                    ).length /
                      drafted.length) *
                      100,
                  ) + "%"
                : "—"}
            </strong>
            <span>Drafts needing corrections</span>
            <small>
              First drafts with product or quantity edits / first drafts created
              in range.
            </small>
          </div>
          <div>
            <strong>{weekly}</strong>
            <span>Weekly active sales users</span>
            <small>
              Distinct sales users with a recorded action in the last 7 days.
            </small>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Stock shortages affecting open quotes</h2>
          <Button variant="ghost" onClick={() => onPage("Products & Stock")}>
            View stock
          </Button>
        </div>
        {shortages.length ? (
          <ul>
            {shortages.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          <Empty text="No shortages in open quotations. Stock availability is checked again during order conversion." />
        )}
      </section>
    </>
  );
}
