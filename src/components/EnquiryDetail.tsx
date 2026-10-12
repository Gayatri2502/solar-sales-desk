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
export default function EnquiryDetail({
  e,
  state,
  run,
  onBack,
  onQuote,
}: {
  e: Enquiry;
  state: State;
  run: Run;
  onBack: () => void;
  onQuote: (id: string) => void;
}) {
  const [selection, setSelection] = useState(e.items.map(() => ""));
  const [quantities, setQuantities] = useState(
    e.items.map((i) => i.quantity || ""),
  );
  const [patch, setPatch] = useState({
    nextAction: e.nextAction,
    due: e.due,
    notes: e.notes,
    assigned: e.assigned,
    status: e.status,
    lostReason: e.lostReason,
  });
  const [message, setMessage] = useState("");
  return (
    <>
      <Button variant="outline" onClick={onBack}>
        Back to enquiries
      </Button>
      <section className="panel">
        <div className="section-heading">
          <h2>{state.customers.find((c) => c.id === e.customerId)?.company}</h2>
          <Tag text={e.status} />
        </div>
        <p>
          Destination: {e.destination || "Not confirmed"} · Requested date:{" "}
          {e.requestedDate || "Not confirmed"}
        </p>
        {e.missing.map((m) => (
          <p className="warning" key={m}>
            {m}
          </p>
        ))}
        <h3>Select catalogue matches</h3>
        <p className="muted">
          Suggestions use catalogue terms. Staff must verify all specifications,
          units, and compatibility.
        </p>
        <FieldGroup>
          {e.items.map((item, i) => {
            const suggestions = match(
              item.description + " " + item.specifications,
              state.products,
            );
            return (
              <fieldset key={i}>
                <legend>{item.description}</legend>
                <p>
                  {item.specifications ||
                    "No technical specifications confirmed."}
                </p>
                <div className="form-grid">
                  <Field>
                    <FieldLabel htmlFor={"match-" + i}>
                      Catalogue product for item {i + 1}
                    </FieldLabel>
                    <select
                      aria-label={"Catalogue match for item " + (i + 1)}
                      id={"match-" + i}
                      value={selection[i]}
                      onChange={(ev) =>
                        setSelection(
                          selection.map((x, n) =>
                            n === i ? ev.target.value : x,
                          ),
                        )
                      }
                    >
                      <option value="">Staff selection required</option>
                      {state.products
                        .filter((p) => p.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name} · {p.unit}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <FieldInput
                    label={`Confirmed quantity ${i + 1}`}
                    value={quantities[i]}
                    onChange={(v) =>
                      setQuantities(quantities.map((x, n) => (n === i ? v : x)))
                    }
                  />
                </div>
                {suggestions.length ? (
                  <ul>
                    {suggestions.map((s) => (
                      <li key={s.product.id}>
                        <strong>{s.product.sku}</strong> — {s.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="warning">
                    No catalogue match. Ask for specifications or add a verified
                    product.
                  </p>
                )}
                {!item.quantity || !item.unit ? (
                  <p className="warning">
                    Confirm missing quantity and unit before preparing a quote.
                  </p>
                ) : null}
              </fieldset>
            );
          })}
          <Button
            onClick={async () => {
              const n = await run({
                type: "quote.create",
                enquiryId: e.id,
                selections: selection.map((productId, i) => ({
                  productId,
                  quantity: quantities[i],
                })),
              });
              if (n) onQuote(n.quotes[0].id);
            }}
          >
            Create draft quotation
          </Button>
        </FieldGroup>
      </section>
      <section className="panel">
        <h2>Next action & follow-up</h2>
        <FieldGroup>
          <div className="form-grid">
            <FieldInput
              label="Next action"
              value={patch.nextAction}
              onChange={(v) => setPatch({ ...patch, nextAction: v })}
            />
            <FieldInput
              label="Due date"
              type="date"
              value={patch.due}
              onChange={(v) => setPatch({ ...patch, due: v })}
            />
            <Field>
              <FieldLabel htmlFor="assigned">Assigned salesperson</FieldLabel>
              <select
                aria-label="Assigned salesperson"
                id="assigned"
                value={patch.assigned}
                onChange={(ev) =>
                  setPatch({ ...patch, assigned: ev.target.value })
                }
              >
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="stage">Pipeline stage</FieldLabel>
              <select
                aria-label="Pipeline stage"
                id="stage"
                value={patch.status}
                onChange={(ev) =>
                  setPatch({
                    ...patch,
                    status: ev.target.value as Enquiry["status"],
                  })
                }
              >
                {stages.map((s) => (
                  <option
                    key={s}
                    disabled={
                      ["Draft quote", "Approved", "Sent", "Won"].includes(s) &&
                      s !== e.status
                    }
                  >
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <FieldInput
            label="Notes"
            value={patch.notes}
            onChange={(v) => setPatch({ ...patch, notes: v })}
          />
          {patch.status === "Lost" ? (
            <FieldInput
              label="Reason lost"
              value={patch.lostReason}
              onChange={(v) => setPatch({ ...patch, lostReason: v })}
            />
          ) : null}
          <div className="toolbar">
            <Button
              onClick={() =>
                run({
                  type: "enquiry.update",
                  id: e.id,
                  patch: {
                    ...patch,
                    status:
                      patch.status === e.status ? undefined : patch.status,
                  },
                })
              }
            >
              Save next action
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run({
                  type: "enquiry.update",
                  id: e.id,
                  patch: { lastContact: new Date().toISOString() },
                })
              }
            >
              Record contact now
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setMessage(
                  `Hello ${state.customers.find((c) => c.id === e.customerId)?.contact || "there"}, following up on your solar equipment enquiry. Could you confirm ${e.missing[0] || "your delivery requirements and next steps"}?`,
                )
              }
            >
              Prepare follow-up message
            </Button>
          </div>
          {message ? (
            <>
              <Field>
                <FieldLabel htmlFor="follow-message">
                  Suggested message — review before sending
                </FieldLabel>
                <textarea
                  aria-label="Suggested follow-up message"
                  id="follow-message"
                  value={message}
                  onChange={(ev) => setMessage(ev.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                onClick={() => download("follow-up.txt", message)}
              >
                Download message
              </Button>
            </>
          ) : null}
        </FieldGroup>
      </section>
    </>
  );
}
