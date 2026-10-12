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
export default function QuoteDetail({
  q,
  state,
  admin,
  run,
  onBack,
  onRevision,
}: {
  q: Quote;
  state: State;
  admin: boolean;
  run: Run;
  onBack: () => void;
  onRevision: (id: string) => void;
}) {
  const [lines, setLines] = useState(q.lines);
  const [delivery, setDelivery] = useState(() => (q.delivery / 100).toFixed(2));
  const [deliveryTax, setDeliveryTax] = useState(
    q.deliveryTaxBps === null ? "" : String(q.deliveryTaxBps / 100),
  );
  const [terms, setTerms] = useState(q.terms);
  const [estimate, setEstimate] = useState(q.deliveryEstimate);
  const [valid, setValid] = useState(q.validUntil);
  const [reason, setReason] = useState("");
  const [localError, setError] = useState("");
  const [message, setMessage] = useState("");
  let total: ReturnType<typeof totals> | null = null;
  try {
    total = totals(
      lines,
      minor(delivery),
      deliveryTax ? minor(deliveryTax) : null,
    );
  } catch {
    /* show configuration hint */
  }
  const customer = state.customers.find((c) => c.id === q.customerId);
  const w = warnings(q, state);
  const update = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const existingOrder = state.orders.find((o) => o.quoteId === q.id);
  return (
    <>
      <div className="toolbar no-print">
        <Button variant="outline" onClick={onBack}>
          Back to quotations
        </Button>
        <Tag text={`${q.status} · revision ${q.revision}`} />
        <span>{q.number}</span>
      </div>
      <section className="panel no-print">
        <h2>Quotation builder</h2>
        <p>
          {customer?.company} · {customer?.address}
        </p>
        <Table
          headers={[
            "Product",
            "Quantity",
            "Price (₹)",
            "Discount %",
            "Tax %",
            "Remove",
          ]}
        >
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <label className="sr-only" htmlFor={"quote-product-" + i}>
                  Product line {i + 1}
                </label>
                <select
                  aria-label={"Product line " + (i + 1)}
                  id={"quote-product-" + i}
                  value={l.productId}
                  onChange={(e) => {
                    const p = state.products.find(
                      (p) => p.id === e.target.value,
                    )!;
                    update(i, {
                      productId: p.id,
                      name: p.name,
                      sku: p.sku,
                      unit: p.unit,
                      price: p.price,
                      cost: p.cost,
                      taxBps: p.taxBps ?? state.settings.taxBps,
                    });
                  }}
                >
                  {state.products
                    .filter((p) => p.active)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                </select>
                <small>{l.unit}</small>
              </td>
              <td>
                <input
                  aria-label={`Quantity line ${i + 1}`}
                  value={l.quantity}
                  onChange={(e) => update(i, { quantity: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Price line ${i + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.price / 100}
                  onChange={(e) => {
                    try {
                      update(i, { price: minor(e.target.value) });
                    } catch {
                      setError("Price needs up to two decimal places.");
                    }
                  }}
                />
              </td>
              <td>
                <input
                  aria-label={`Discount line ${i + 1}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={l.discountBps / 100}
                  onChange={(e) => {
                    try {
                      update(i, { discountBps: minor(e.target.value) });
                    } catch {
                      setError("Discount needs up to two decimal places.");
                    }
                  }}
                />
              </td>
              <td>
                <input
                  aria-label={`Tax line ${i + 1}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={l.taxBps === null ? "" : l.taxBps / 100}
                  onChange={(e) => {
                    try {
                      update(i, {
                        taxBps: e.target.value ? minor(e.target.value) : null,
                      });
                    } catch {
                      setError("Tax needs up to two decimal places.");
                    }
                  }}
                />
              </td>
              <td>
                <Button
                  variant="ghost"
                  onClick={() => setLines(lines.filter((_, n) => n !== i))}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <Button
          variant="outline"
          onClick={() => {
            const p = state.products.find((p) => p.active);
            if (p)
              setLines([
                ...lines,
                {
                  productId: p.id,
                  name: p.name,
                  sku: p.sku,
                  unit: p.unit,
                  quantity: "1",
                  price: p.price,
                  discountBps: 0,
                  taxBps: p.taxBps ?? state.settings.taxBps,
                  cost: p.cost,
                },
              ]);
          }}
        >
          Add line
        </Button>
        <FieldGroup>
          <div className="form-grid">
            <FieldInput
              label="Delivery charge (₹)"
              value={delivery}
              onChange={setDelivery}
            />
            <FieldInput
              label="Delivery tax (%)"
              value={deliveryTax}
              onChange={setDeliveryTax}
            />
            <FieldInput
              label="Valid until"
              type="date"
              value={valid}
              onChange={setValid}
            />
            <FieldInput
              label="Delivery estimate"
              value={estimate}
              onChange={setEstimate}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="quote-terms">
              Payment and delivery terms
            </FieldLabel>
            <textarea
              aria-label="Payment and delivery terms"
              id="quote-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </Field>
          <div className="quote-totals">
            {total ? (
              <>
                <span>Subtotal {money(total.subtotal)}</span>
                <span>Discount {money(total.discount)}</span>
                <span>Tax {money(total.tax)}</span>
                <strong>Total {money(total.total)}</strong>
                {admin ? (
                  <small>
                    Internal cost:{" "}
                    {total.cost === null ? "Missing" : money(total.cost)} ·
                    Margin:{" "}
                    {total.marginBps === null
                      ? "Unavailable"
                      : (total.marginBps / 100).toFixed(2) + "%"}
                  </small>
                ) : null}
              </>
            ) : (
              <p className="warning">
                Configure all taxes and valid quantities to calculate the total.
                Enter 0 only when explicitly appropriate.
              </p>
            )}
          </div>
          {w.map((x) => (
            <p className="warning" key={x}>
              {x}
            </p>
          ))}
          {localError ? <p role="alert">{localError}</p> : null}
          <div className="toolbar">
            <Button
              disabled={
                q.status === "Superseded" ||
                (!!existingOrder && existingOrder.status !== "Cancelled")
              }
              onClick={async () => {
                try {
                  const n = await run({
                    type: "quote.edit",
                    id: q.id,
                    patch: {
                      lines: lines.map(
                        ({
                          productId,
                          quantity,
                          price,
                          discountBps,
                          taxBps,
                        }) => ({
                          productId,
                          quantity,
                          price,
                          discountBps,
                          taxBps,
                        }),
                      ),
                      delivery: minor(delivery),
                      deliveryTaxBps: deliveryTax ? minor(deliveryTax) : null,
                      terms,
                      deliveryEstimate: estimate,
                      validUntil: valid,
                    },
                  });
                  if (n) {
                    const revision = n.quotes.find(
                      (x) => x.number === q.number && x.status !== "Superseded",
                    );
                    if (revision) onRevision(revision.id);
                  }
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {q.status === "Draft" ? "Save draft" : "Create new revision"}
            </Button>
          </div>
          <p className="muted">
            Approval, printing and conversion use the saved revision. Save edits
            before approval. Approved edits create a new draft.
          </p>
          {admin && q.status === "Draft" ? (
            <>
              <FieldInput
                label="Approval reason (required to acknowledge warnings)"
                value={reason}
                onChange={setReason}
              />
              <Button
                onClick={() => run({ type: "quote.approve", id: q.id, reason })}
              >
                Approve saved quotation
              </Button>
            </>
          ) : null}
          {!admin && q.status === "Draft" ? (
            <p>Business admin approval is required.</p>
          ) : null}
          {["Approved", "Sent"].includes(q.status) ? (
            <div className="toolbar">
              <Button variant="outline" onClick={() => window.print()}>
                Print / save PDF
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setMessage(
                    `Hello ${customer?.contact || "there"}, please find quotation ${q.number} revision ${q.revision}, total ${safeTotal(q) === null ? "pending" : money(safeTotal(q)!)}. Valid until ${q.validUntil}. ${q.terms}`,
                  )
                }
              >
                Prepare customer message
              </Button>
              {q.status === "Approved" ? (
                <Button
                  variant="outline"
                  onClick={() => run({ type: "quote.sent", id: q.id })}
                >
                  Mark sent after sharing
                </Button>
              ) : null}
              <Button
                disabled={!!existingOrder}
                onClick={() => run({ type: "order.create", id: q.id })}
              >
                {existingOrder
                  ? "Order already created"
                  : "Convert accepted quote to order"}
              </Button>
            </div>
          ) : null}
          {message ? (
            <>
              <Field>
                <FieldLabel htmlFor="customer-message">
                  Prepared customer message
                </FieldLabel>
                <textarea
                  aria-label="Prepared customer message"
                  id="customer-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
              <div className="toolbar">
                <Button
                  variant="outline"
                  onClick={() => download("quotation-message.txt", message)}
                >
                  Download message
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(message);
                      setError("Message copied. Sending remains your action.");
                    } catch {
                      setError(
                        "Copy unavailable. Select the message or download it.",
                      );
                    }
                  }}
                >
                  Copy message
                </Button>
              </div>
            </>
          ) : null}
        </FieldGroup>
      </section>
      <section className="customer-document">
        <header>
          <div>
            <h2>{state.settings.name}</h2>
            <p>
              {state.settings.address}
              <br />
              {state.settings.contact}
              {state.settings.gstin ? (
                <>
                  <br />
                  GSTIN: {state.settings.gstin}
                </>
              ) : null}
            </p>
          </div>
          <div>
            <h2>Quotation</h2>
            <strong>
              {q.number} · Revision {q.revision}
            </strong>
            <p>
              Valid until {q.validUntil}
              <br />
              {q.status === "Draft" ? "DRAFT — not approved" : q.status}
            </p>
          </div>
        </header>
        <p>
          <strong>Prepared for {customer?.company}</strong>
          <br />
          {customer?.contact}
          <br />
          {customer?.address}
          {customer?.gstin ? (
            <>
              <br />
              GSTIN: {customer.gstin}
            </>
          ) : null}
        </p>
        <Table
          headers={[
            "SKU / product",
            "Quantity",
            "Unit price",
            "Discount",
            "Tax",
            "Line total",
          ]}
        >
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.sku}
                <br />
                {l.name}
              </td>
              <td>
                {l.quantity} {l.unit}
              </td>
              <td>{money(l.price)}</td>
              <td>{l.discountBps / 100}%</td>
              <td>
                {l.taxBps === null ? "Unconfigured" : l.taxBps / 100 + "%"}
              </td>
              <td>
                {l.taxBps === null ? "—" : money(totals([l], 0, 0).total)}
              </td>
            </tr>
          ))}
        </Table>
        <p>
          Delivery: {money(q.delivery)} · Delivery tax:{" "}
          {q.deliveryTaxBps === null
            ? "Unconfigured"
            : q.deliveryTaxBps / 100 + "%"}
        </p>
        <p className="document-total">
          Total:{" "}
          {safeTotal(q) === null
            ? "Tax configuration required"
            : money(safeTotal(q)!)}
        </p>
        <p>Delivery estimate: {q.deliveryEstimate}</p>
        <p className="pre-wrap">{q.terms}</p>
        <p>
          Technical suitability requires verified specifications and site
          requirements.
        </p>
      </section>
      <section className="panel no-print">
        <h2>Revision history</h2>
        {state.quotes
          .filter((x) => x.number === q.number)
          .map((x) => (
            <p key={x.id}>
              <Button variant="ghost" onClick={() => onRevision(x.id)}>
                Revision {x.revision} · {x.status}
              </Button>
              {x.approvedAt
                ? "Approved " +
                  new Date(x.approvedAt).toLocaleString("en-IN", {
                    timeZone: state.settings.timezone,
                  })
                : ""}
            </p>
          ))}
      </section>
    </>
  );
}
