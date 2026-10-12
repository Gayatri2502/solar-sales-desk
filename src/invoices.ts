import { z } from "zod";
import {
  type State,
  type Order,
  type Command,
  type Role,
  totals,
  localDay,
  uid,
  money,
} from "./domain";
export type Invoice = {
  id: string;
  orderId: string;
  number: string;
  revision: number;
  status:
    | "Draft"
    | "Pending approval"
    | "Approved"
    | "Sending"
    | "Sent"
    | "Demo sent"
    | "Failed"
    | "Voided";
  seller: { name: string; address: string; contact: string; gstin: string };
  customer: {
    company: string;
    contact: string;
    address: string;
    gstin: string;
    email: string;
  };
  lines: Omit<Order["lines"][number], "cost">[];
  delivery: number;
  deliveryTaxBps: number | null;
  total: number;
  issuedOn: string;
  terms: string;
  notes: string;
  createdAt: string;
  approvedAt: string;
  approvedBy: string;
  sentAt: string;
  providerId: string;
  attempts: number;
  firstAttemptAt: string;
  lastAttemptAt: string;
  lease: string;
  error: string;
};
export function createInvoice(s: State, o: Order, now: string): Invoice {
  const c = s.customers.find((c) => c.id === o.customerId),
    q = s.quotes.find((q) => q.id === o.quoteId);
  if (!c || !q)
    throw Error("Customer and accepted quotation are required for an invoice.");
  const i: Invoice = {
    id: uid(),
    orderId: o.id,
    number: `INV-${String((s.invoices || []).length + 1).padStart(5, "0")}`,
    revision: 1,
    status: "Draft",
    seller: {
      name: s.settings.name,
      address: s.settings.address,
      contact: s.settings.contact,
      gstin: s.settings.gstin,
    },
    customer: {
      company: c.company,
      contact: c.contact,
      address: c.address,
      gstin: c.gstin,
      email: c.email,
    },
    lines: o.lines.map(({ cost, ...l }) => l),
    delivery: q.delivery,
    deliveryTaxBps: q.deliveryTaxBps,
    total: o.total,
    issuedOn: localDay(now, s.settings.timezone),
    terms: q.terms,
    notes: "",
    createdAt: now,
    approvedAt: "",
    approvedBy: "",
    sentAt: "",
    providerId: "",
    attempts: 0,
    firstAttemptAt: "",
    lastAttemptAt: "",
    lease: "",
    error: "",
  };
  (s.invoices ||= []).unshift(i);
  return i;
}
export function invoiceAction(
  s: State,
  cmd: Command,
  actor: { id: string; role: Role },
  now: string,
) {
  const i = s.invoices?.find((i) => i.id === cmd.id);
  if (!i) throw Error("Invoice not found.");
  const o = s.orders.find((o) => o.id === i.orderId);
  if (!o || o.status === "Cancelled" || i.status === "Voided")
    throw Error("Cancelled orders cannot be invoiced or sent.");
  const admin = () => {
    if (actor.role !== "admin")
      throw Error(
        "Only a business admin can approve or manage invoice delivery.",
      );
  };
  switch (cmd.type) {
    case "invoice.edit": {
      if (
        !["Draft", "Pending approval", "Approved"].includes(i.status) ||
        i.attempts
      )
        throw Error("This invoice cannot be changed after a delivery attempt.");
      const v = z
        .strictObject({
          email: z.email(),
          address: z.string().min(1).max(1000),
          gstin: z.string().max(30),
          terms: z.string().max(3000),
          notes: z.string().max(2000),
        })
        .parse(cmd.patch);
      i.customer = {
        ...i.customer,
        email: v.email,
        address: v.address,
        gstin: v.gstin,
      };
      i.terms = v.terms;
      i.notes = v.notes;
      i.revision++;
      i.status = "Draft";
      i.approvedAt = "";
      i.approvedBy = "";
      i.error = "";
      break;
    }
    case "invoice.refreshBusiness":
      admin();
      if (
        !["Draft", "Pending approval", "Approved"].includes(i.status) ||
        i.attempts
      )
        throw Error(
          "Only invoices without delivery attempts can refresh business details.",
        );
      i.seller = {
        name: s.settings.name,
        address: s.settings.address,
        contact: s.settings.contact,
        gstin: s.settings.gstin,
      };
      i.revision++;
      i.status = "Draft";
      i.approvedBy = "";
      i.approvedAt = "";
      break;
    case "invoice.submit":
      if (i.status !== "Draft")
        throw Error("Only draft invoices can be submitted.");
      validateInvoice(i);
      i.status = "Pending approval";
      break;
    case "invoice.approve":
      admin();
      if (i.status !== "Pending approval")
        throw Error("Submit the invoice for approval first.");
      validateInvoice(i);
      i.status = "Approved";
      i.approvedAt = now;
      i.approvedBy = actor.id;
      break;
    case "invoice.return":
      admin();
      if (!["Pending approval", "Approved"].includes(i.status) || i.attempts)
        throw Error("Only unsent invoices can be returned for correction.");
      i.status = "Draft";
      i.approvedAt = "";
      i.approvedBy = "";
      break;
    case "invoice.claim":
      admin();
      if (
        !i.approvedBy ||
        !["Approved", "Failed", "Sending"].includes(i.status)
      )
        throw Error("Invoice approval is required before delivery.");
      if (
        i.status === "Sending" &&
        Date.parse(now) - Date.parse(i.lastAttemptAt) < 120000
      )
        throw Error("Invoice delivery is already in progress.");
      if (
        i.attempts >= 3 ||
        (i.firstAttemptAt &&
          Date.parse(now) - Date.parse(i.firstAttemptAt) > 23 * 3600000)
      )
        throw Error(
          "Delivery needs operator review; automatic retry window exhausted.",
        );
      i.status = "Sending";
      i.attempts++;
      i.firstAttemptAt ||= now;
      i.lastAttemptAt = now;
      i.lease = z.string().min(1).parse(cmd.lease);
      i.error = "";
      break;
    case "invoice.complete":
    case "invoice.fail":
      admin();
      if (i.status !== "Sending" || i.lease !== cmd.lease)
        throw Error(
          "Invoice delivery lease changed. Refresh the delivery status.",
        );
      if (cmd.type === "invoice.complete") {
        i.status = "Sent";
        i.providerId = z.string().min(1).max(200).parse(cmd.providerId);
        i.sentAt = now;
        i.error = "";
      } else {
        i.status = "Failed";
        i.error =
          "Email acceptance could not be confirmed. Automatic retries use the same delivery key; operator review is required after three attempts or 23 hours.";
      }
      break;
    case "invoice.demoSend":
      admin();
      if (i.status !== "Approved" || !i.approvedBy)
        throw Error("Invoice approval is required before delivery.");
      i.status = "Demo sent";
      i.sentAt = now;
      i.providerId = "synthetic-no-email-sent";
      break;
    default:
      throw Error("Unknown invoice action.");
  }
  s.events.push({ at: now, user: actor.id, type: cmd.type, entity: i.id });
  return i.number;
}
export function validateInvoice(i: Invoice) {
  if (
    !z.email().safeParse(i.customer.email).success ||
    !i.customer.address.trim() ||
    !i.seller.name.trim() ||
    !i.seller.address.trim() ||
    !i.seller.contact.trim()
  )
    throw Error(
      "Complete the customer email/address and business name/address/contact before approval.",
    );
  const total = totals(
    i.lines.map((l) => ({ ...l, cost: null })),
    i.delivery,
    i.deliveryTaxBps,
  ).total;
  if (total !== i.total)
    throw Error("Invoice does not match the accepted order total.");
}
export function invoiceHTML(i: Invoice) {
  const esc = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  return `<html><body><h1>Invoice ${esc(i.number)}</h1><p>${esc(i.seller.name)}<br>${esc(i.seller.address)}<br>${esc(i.seller.contact)}${i.seller.gstin ? "<br>GSTIN: " + esc(i.seller.gstin) : ""}</p><p>Date: ${esc(i.issuedOn)} · Revision ${i.revision}</p><h2>Bill to</h2><p>${esc(i.customer.company)}<br>${esc(i.customer.address)}${i.customer.gstin ? "<br>GSTIN: " + esc(i.customer.gstin) : ""}</p><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>${i.lines.map((l) => `<tr><td>${esc(l.name)} (${esc(l.sku)})</td><td>${esc(l.quantity)} ${esc(l.unit)}</td><td>${money(l.price)}</td><td>${l.discountBps / 100}%</td><td>${(l.taxBps || 0) / 100}%</td><td>${money(totals([{ ...l, cost: null }]).total)}</td></tr>`).join("")}</tbody></table><p>Delivery: ${money(i.delivery)} · Delivery tax: ${(i.deliveryTaxBps || 0) / 100}%</p><h2>Total: ${money(i.total)}</h2><p>Payment terms: ${esc(i.terms)}</p><p>${esc(i.notes)}</p><p>This invoice does not confirm payment receipt.</p></body></html>`;
}
