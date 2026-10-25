import { useState } from "react";
import { type State, money } from "../domain";
import { type Invoice } from "../invoices";
import { live } from "../api";
import { Button } from "./ui/button";
import { FieldInput, Table, Tag, Empty, type Run } from "./shared";
export default function Invoices({
  state,
  admin,
  run,
  onRefresh,
}: {
  state: State;
  admin: boolean;
  run: Run;
  onRefresh?: () => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const i = state.invoices?.find((i) => i.id === selected);
  const [email, setEmail] = useState(""),
    [address, setAddress] = useState(""),
    [gstin, setGstin] = useState(""),
    [terms, setTerms] = useState(""),
    [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const open = (i: Invoice) => {
    setSelected(i.id);
    setEmail(i.customer.email);
    setAddress(i.customer.address);
    setGstin(i.customer.gstin);
    setTerms(i.terms);
    setNotes(i.notes);
  };
  const action = async (type: string) => {
    setWorking(true);
    try {
      await run({ type, id: i!.id });
    } finally {
      setWorking(false);
    }
  };
  if (!i)
    return (
      <>
        <section className="panel">
          <h2>Order invoices</h2>
          <p>
            Order confirmation creates a draft automatically. Sales review →
            submit → admin approves → email queue. An invoice does not confirm
            payment.
          </p>
          <p>
            {live
              ? "Email delivery needs a verified sender and server configuration. Accepted by the email provider does not confirm customer receipt."
              : "Local preview does not send email. Configure and verify a sender before customer delivery."}
          </p>
        </section>
        <Table
          headers={[
            "Invoice",
            "Customer",
            "Order",
            "Status",
            "Total",
            "Actions",
          ]}
        >
          {(state.invoices || []).map((i) => (
            <tr key={i.id}>
              <td>
                <strong>{i.number}</strong>
                <small>Revision {i.revision}</small>
              </td>
              <td>{i.customer.company}</td>
              <td>{state.orders.find((o) => o.id === i.orderId)?.number}</td>
              <td>
                <Tag text={i.status} />
                {i.error && <small className="warning">{i.error}</small>}
              </td>
              <td>{money(i.total)}</td>
              <td>
                <Button variant="outline" onClick={() => open(i)}>
                  Review invoice
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        {!state.invoices?.length && (
          <Empty text="No invoices yet. Convert an accepted quotation into an order to create a draft invoice." />
        )}
      </>
    );
  const editable =
    ["Draft", "Pending approval", "Approved"].includes(i.status) && !i.attempts;
  const dirty =
    email !== i.customer.email ||
    address !== i.customer.address ||
    gstin !== i.customer.gstin ||
    terms !== i.terms ||
    notes !== i.notes;
  return (
    <>
      <div className="toolbar no-print">
        {live && (
          <Button variant="outline" onClick={onRefresh}>
            Refresh delivery status
          </Button>
        )}
        <Button variant="outline" onClick={() => setSelected("")}>
          Back to invoices
        </Button>
        <Tag text={i.status} />
        <span>
          {i.number} · Revision {i.revision}
        </span>
      </div>
      <section className="panel no-print">
        <h2>Invoice review and approval</h2>
        <p>
          Prices and taxes are frozen from the accepted order. Saving customer
          or terms changes creates a new revision and removes approval. Delivery
          is blocked until admin approves the saved revision.
        </p>
        {editable && admin && (
          <Button
            variant="outline"
            disabled={working}
            onClick={() => action("invoice.refreshBusiness")}
          >
            Update business details from Settings
          </Button>
        )}
        {editable && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setWorking(true);
              try {
                await run({
                  type: "invoice.edit",
                  id: i.id,
                  patch: { email, address, gstin, terms, notes },
                });
              } finally {
                setWorking(false);
              }
            }}
          >
            <div className="form-grid">
              <FieldInput
                label="Invoice recipient email"
                type="email"
                required
                value={email}
                onChange={setEmail}
              />
              <FieldInput
                label="Billing address"
                required
                value={address}
                onChange={setAddress}
              />
              <FieldInput
                label="Customer GSTIN (optional)"
                value={gstin}
                onChange={setGstin}
              />
              <FieldInput
                label="Invoice payment terms"
                value={terms}
                onChange={setTerms}
              />
              <FieldInput
                label="Customer-facing invoice note"
                value={notes}
                onChange={setNotes}
              />
            </div>
            <Button disabled={working || !dirty}>Save invoice revision</Button>
          </form>
        )}
        {dirty && editable && (
          <p role="status">Save your changes before submitting or approving.</p>
        )}
        <div className="toolbar">
          {i.status === "Draft" && (
            <Button
              disabled={working || dirty}
              onClick={() => action("invoice.submit")}
            >
              Submit for admin approval
            </Button>
          )}
          {i.status === "Pending approval" && admin && (
            <Button
              disabled={working || dirty}
              onClick={() => action("invoice.approve")}
            >
              {live ? "Approve invoice" : "Approve invoice (preview only)"}
            </Button>
          )}
          {["Pending approval", "Approved"].includes(i.status) &&
            admin &&
            !i.attempts && (
              <Button
                disabled={working}
                variant="outline"
                onClick={() => action("invoice.return")}
              >
                Return for correction
              </Button>
            )}
          {["Approved", "Sending", "Sent", "Demo sent", "Failed"].includes(
            i.status,
          ) && (
            <Button variant="outline" onClick={() => window.print()}>
              Print approved invoice / PDF
            </Button>
          )}
        </div>
        <p>
          {i.status === "Approved"
            ? live ? "Approved. Email delivery waits for verified server configuration and the delivery queue." : "Approved in local preview. No email was sent."
            : i.status === "Sent"
              ? `Email accepted by provider · ${i.sentAt}. Customer delivery is not verified.`
              : i.status === "Demo sent"
                ? "Legacy preview status. No email was sent."
                : i.status === "Failed"
                  ? i.error
                  : i.status === "Sending"
                    ? "Email submission in progress. Refresh after the scheduler runs."
                    : "Draft and pending invoices cannot be sent."}
        </p>
        {i.approvedAt && (
          <p>
            Approved by{" "}
            {state.users.find((u) => u.id === i.approvedBy)?.name ||
              "Business admin"}{" "}
            · {i.approvedAt}
          </p>
        )}
      </section>
      <InvoiceDocument invoice={i} />
    </>
  );
}
export function InvoiceDocument({ invoice: i }: { invoice: Invoice }) {
  return (
    <section className="customer-document">
      <header>
        <div>
          <h2>{i.seller.name}</h2>
          <p>{i.seller.address}</p>
          <p>{i.seller.contact}</p>
          {i.seller.gstin && <p>GSTIN: {i.seller.gstin}</p>}
        </div>
        <div>
          <h2>Invoice {i.number}</h2>
          <p>
            {i.issuedOn} · Revision {i.revision}
          </p>
          {["Draft", "Pending approval", "Voided"].includes(i.status) && (
            <strong>{i.status} — not issued</strong>
          )}
        </div>
      </header>
      <h3>Bill to</h3>
      <p>
        {i.customer.company} · {i.customer.contact}
      </p>
      <p>{i.customer.address}</p>
      {i.customer.gstin && <p>GSTIN: {i.customer.gstin}</p>}
      <Table headers={["Product", "Quantity", "Unit price", "Discount", "Tax"]}>
        {i.lines.map((l, n) => (
          <tr key={l.productId + "-" + n}>
            <td>
              {l.name}
              <small>{l.sku}</small>
            </td>
            <td>
              {l.quantity} {l.unit}
            </td>
            <td>{money(l.price)}</td>
            <td>{l.discountBps / 100}%</td>
            <td>{(l.taxBps || 0) / 100}%</td>
          </tr>
        ))}
      </Table>
      <p>
        Delivery: {money(i.delivery)} · Delivery tax:{" "}
        {(i.deliveryTaxBps || 0) / 100}%
      </p>
      <h3>Total: {money(i.total)}</h3>
      <p>Payment terms: {i.terms}</p>
      <p>{i.notes}</p>
      <p>This invoice does not confirm payment receipt.</p>
    </section>
  );
}
