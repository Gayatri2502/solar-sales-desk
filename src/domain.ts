import {communicationAction,type CommunicationJob,type CommunicationPolicy} from "./communications";
import { createInvoice, invoiceAction, type Invoice } from "./invoices";
import { z } from "zod";
import {
  callRecordSchema,
  expenseSchema,
  type CallRecord,
  type Expense,
} from "./reporting";
import { leadInput, phoneSchema, solarProfileSchema, type Lead } from "./leads";
export type Role = "admin" | "sales";
export const categories = [
  "Panel",
  "Inverter",
  "Battery",
  "Mounting",
  "Accessory",
] as const;
export const stages = [
  "New",
  "Needs information",
  "Draft quote",
  "Approved",
  "Sent",
  "Follow-up due",
  "Won",
  "Lost",
] as const;
export const productSchema = z.object({
  id: z.string(),
  sku: z.string().min(1).max(80),
  brand: z.string().max(100),
  category: z.enum(categories),
  name: z.string().min(1).max(200),
  attributes: z.string().max(1000),
  unit: z.string().min(1).max(30),
  cost: z.number().int().nonnegative().max(100000000).nullable(),
  price: z.number().int().nonnegative().max(100000000),
  physical: z.number().int().nonnegative().max(1000000000),
  reserved: z.number().int().nonnegative(),
  taxBps: z.number().int().min(0).max(10000).nullable(),
  active: z.boolean(),
  stockAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;
export const customerSchema = z.object({
  id: z.string(),
  company: z.string().min(1).max(200),
  contact: z.string().max(100),
  phone: z.string().max(40),
  email: z.union([z.email(), z.literal("")]),
  address: z.string().max(1000),
  gstin: z.string().max(30),
  notes: z.string().max(2000),
  priceList: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type Customer = z.infer<typeof customerSchema>;
export const requestSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .nullable(),
  unit: z.string().max(30).nullable(),
  specifications: z.string().max(1000),
});
export const extractionSchema = z.strictObject({
  items: z.array(requestSchema).min(1).max(40),
  destination: z.string().max(500),
  requestedDate: z.string().max(100),
  missing: z.array(z.string().max(300)).max(40),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type Enquiry = {
  id: string;
  customerId: string;
  text: string;
  items: Extraction["items"];
  destination: string;
  requestedDate: string;
  missing: string[];
  status: (typeof stages)[number];
  assigned: string;
  nextAction: string;
  due: string;
  lastContact: string;
  notes: string;
  lostReason: string;
  createdAt: string;
  updatedAt: string;
};
export type Line = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: string;
  price: number;
  discountBps: number;
  taxBps: number | null;
  cost: number | null;
};
export type Quote = {
  id: string;
  number: string;
  enquiryId: string;
  customerId: string;
  revision: number;
  lines: Line[];
  delivery: number;
  deliveryTaxBps: number | null;
  terms: string;
  deliveryEstimate: string;
  validUntil: string;
  status: "Draft" | "Approved" | "Sent" | "Superseded";
  createdAt: string;
  approvedAt: string;
  approvedBy: string;
  sentAt: string;
  corrected: boolean;
};
export type Order = {
  id: string;
  quoteId: string;
  number: string;
  customerId: string;
  lines: Line[];
  total: number;
  status: "Confirmed" | "Preparing" | "Dispatched" | "Delivered" | "Cancelled";
  createdAt: string;
};
export type Settings = {
  name: string;
  address: string;
  contact: string;
  gstin: string;
  currency: string;
  timezone: string;
  taxBps: number | null;
  deliveryTaxBps: number | null;
  prefix: string;
  validDays: number;
  paymentTerms: string;
  deliveryTerms: string;
  marginBps: number;
  stockStaleDays: number;
  subscription: "Pilot" | "Active" | "Past due" | "Cancelled";
  renewal: string;
  fee: number;
  allowance: number;
  userLimit: number;
  spendCeilingMicros: number;
  baseline: {
    prepMinutes: string;
    followupPercent: string;
    correctionPercent: string;
    conversionPercent: string;
    weeklyUsers: string;
  };
};
export type State = {
  version: 1;
  communicationJobs?:CommunicationJob[];
  communicationPolicy?:CommunicationPolicy;
  inboundMessages?:{id:string;leadId:string;phone:string;text:string;at:string;reply:string|null}[];
  invoices?: Invoice[];
  leads?: Lead[];
  callRecords?: CallRecord[];
  expenses?: Expense[];
  followups: {
    id: string;
    enquiryId: string;
    due: string;
    assigned: string;
    completedAt: string;
  }[];
  settings: Settings;
  products: Product[];
  customers: Customer[];
  enquiries: Enquiry[];
  quotes: Quote[];
  orders: Order[];
  audit: {
    id: string;
    at: string;
    user: string;
    action: string;
    detail: string;
  }[];
  events: {
    at: string;
    user: string;
    type: string;
    entity: string;
    value?: number;
  }[];
  usage: {
    id: string;
    at: string;
    user: string;
    inputTokens: number;
    outputTokens: number;
    estimatedMicros: number;
    status: string;
  }[];
  users: { id: string; name: string; role: Role }[];
};
export const uid = () => crypto.randomUUID();
function fail(message: string): never {
  throw new Error(message);
}
export function minor(v: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(v))
    fail("Enter a non-negative amount with up to two decimals.");
  const [a, b = ""] = v.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000) fail("Amount is too large.");
  return n;
}
export function qty(v: string): number {
  if (!/^\d+(\.\d{1,3})?$/.test(v))
    fail("Quantity needs up to three decimals.");
  const [a, b = ""] = v.split(".");
  const n = Number(a) * 1000 + Number(b.padEnd(3, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1000000000)
    fail("Quantity must be positive and within the supported range.");
  return n;
}
const round = (n: bigint, d: bigint) => Number((n + d / 2n) / d);
export function totals(
  lines: Line[],
  delivery = 0,
  deliveryTaxBps: number | null = 0,
) {
  let subtotal = 0,
    discount = 0,
    tax = 0,
    cost = 0,
    missingCost = false;
  for (const l of lines) {
    const q = qty(l.quantity);
    if (
      !Number.isSafeInteger(l.price) ||
      l.price < 0 ||
      !Number.isInteger(l.discountBps) ||
      l.discountBps < 0 ||
      l.discountBps > 10000 ||
      l.taxBps === null ||
      !Number.isInteger(l.taxBps) ||
      l.taxBps < 0 ||
      l.taxBps > 10000
    )
      fail("Configure prices, discounts and taxes before approval.");
    const gross = round(BigInt(l.price) * BigInt(q), 1000n);
    const d = round(BigInt(gross) * BigInt(l.discountBps), 10000n);
    subtotal += gross;
    discount += d;
    tax += round(BigInt(gross - d) * BigInt(l.taxBps), 10000n);
    if (l.cost === null) missingCost = true;
    else cost += round(BigInt(l.cost) * BigInt(q), 1000n);
  }
  if (
    !Number.isInteger(delivery) ||
    delivery < 0 ||
    deliveryTaxBps === null ||
    !Number.isInteger(deliveryTaxBps) ||
    deliveryTaxBps < 0 ||
    deliveryTaxBps > 10000
  )
    fail("Configure delivery charge and its tax rate.");
  tax += round(BigInt(delivery) * BigInt(deliveryTaxBps), 10000n);
  const net = subtotal - discount;
  return {
    subtotal,
    discount,
    net,
    tax,
    total: net + tax + delivery,
    cost: missingCost ? null : cost,
    marginBps:
      missingCost || net === 0
        ? null
        : Math.round(((net - cost) * 10000) / net),
  };
}
const moneyFormatters = new Map<string, Intl.NumberFormat>();
export function money(n: number, currency = "INR") {
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(currency, f);
  }
  return f.format(n / 100);
}
export function localDay(now: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}
export function match(description: string, products: Product[]) {
  description = description.replace(
    /\b\d+(?:\.\d{1,3})?\s*(?:pcs?|pieces?|units?|sets?|nos?)\b/gi,
    " ",
  );
  const words = description.toLowerCase().match(/[a-z0-9]+/g) || [];
  const specs = words.filter((w) => /^\d/.test(w));
  const categories: [RegExp, Product["category"]][] = [
    [/\bpanels?\b/i, "Panel"],
    [/\binverters?\b/i, "Inverter"],
    [/\bbatter(?:y|ies)\b/i, "Battery"],
    [/\bmounting|structure\b/i, "Mounting"],
    [/\bcables?|accessor(?:y|ies)\b/i, "Accessory"],
  ];
  const requestedCategory = categories.find(([pattern]) =>
    pattern.test(description),
  )?.[1];
  const power = (value: string) => {
    const m = value.match(/(\d+(?:\.\d+)?)\s*(kw|w)\b/i);
    return m ? Number(m[1]) * (m[2].toLowerCase() === "kw" ? 1000 : 1) : null;
  };
  const requestedPower = power(description);
  return products
    .filter(
      (p) =>
        p.active && (!requestedCategory || p.category === requestedCategory),
    )
    .filter((p) => {
      const listedPower = power(p.name + " " + p.attributes);
      return (
        requestedPower === null ||
        listedPower === null ||
        requestedPower === listedPower
      );
    })
    .map((p) => {
      const text =
        `${p.sku} ${p.name} ${p.category} ${p.attributes}`.toLowerCase();
      const hits = words.filter((w) => text.includes(w));
      const conflicts = specs.filter((w) => !text.includes(w));
      return {
        product: p,
        score: hits.length,
        reason: conflicts.length
          ? `Verify specification: ${conflicts.join(", ")}`
          : `${hits.length} catalogue terms match; staff must verify specifications`,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
export function mockExtract(text: string): Extraction {
  if (text.length > 12000)
    fail("Enquiry exceeds 12,000 characters. Split it into smaller enquiries.");
  const items = text
    .split(/[\n;]/)
    .filter((s) => s.trim())
    .slice(0, 40)
    .map((description) => {
      const m = description.match(
        /(?:^|\s)(\d+(?:\.\d{1,3})?)\s*(pcs?|pieces?|units?|sets?|nos?)\b/i,
      );
      return {
        description: description.trim().slice(0, 500),
        quantity: m?.[1] || null,
        unit: m ? (/\bsets?\b/i.test(m[0]) ? "sets" : "pcs") : null,
        specifications: "",
      };
    });
  return extractionSchema.parse({
    items,
    destination: "",
    requestedDate: "",
    missing: items.flatMap((i, n) =>
      i.quantity ? [] : [`Item ${n + 1}: confirm quantity and unit`],
    ),
  });
}
export function warnings(q: Quote, s: State) {
  const out: string[] = [];
  q.lines.forEach((l) => {
    const p = s.products.find((p) => p.id === l.productId);
    if (!p || !p.active) out.push(`${l.name}: inactive or missing product`);
    else {
      if (p.physical - p.reserved < qty(l.quantity))
        out.push(`${p.sku}: insufficient available stock`);
      if (
        Date.now() - Date.parse(p.stockAt) >
        s.settings.stockStaleDays * 86400000
      )
        out.push(`${p.sku}: stock snapshot is stale`);
    }
    if (l.cost === null) out.push(`${l.sku}: cost price missing`);
    if (l.taxBps === null) out.push(`${l.sku}: tax not configured`);
  });
  const enquiry = s.enquiries.find((e) => e.id === q.enquiryId);
  if (enquiry?.missing.length)
    out.push(
      "Enquiry has unresolved requirements: " + enquiry.missing.join("; "),
    );
  const customer = s.customers.find((c) => c.id === q.customerId);
  if (!customer) out.push("Select a customer");
  else if (!customer.company || !customer.address)
    out.push("Customer company or address is missing");
  if (!q.lines.length) out.push("Add a line item");
  try {
    const t = totals(q.lines, q.delivery, q.deliveryTaxBps);
    if (t.marginBps !== null && t.marginBps < s.settings.marginBps)
      out.push("Price is below your margin threshold");
  } catch (e) {
    out.push((e as Error).message);
  }
  return [...new Set(out)];
}
export type Command = { type: string; [key: string]: unknown };
export function reduce(
  state: State,
  cmd: Command,
  actor: { id: string; role: Role },
  now = new Date().toISOString(),
): State {
  const s = structuredClone(state);
  s.invoices ||= [];
  s.followups ||= [];
  s.leads ||= [];
  s.callRecords ||= [];
  s.expenses ||= [];
  const admin = () => {
    if (actor.role !== "admin")
      fail("Only a business admin can perform this action.");
  };
  const lookup = <T extends { id: string }>(list: T[], id: unknown) =>
    list.find((x) => x.id === id) || fail("Record not found.");
  const event = (type: string, entity: string, value?: number) =>
    s.events.push({ at: now, user: actor.id, type, entity, value });
  let detail = "";
  switch (cmd.type) {
    case "comms.policy":case "comms.queue":case "comms.inbound":case "comms.claim":case "comms.accepted":case "comms.failed":case "comms.uncertain":case "comms.receipt":case "comms.callCompleted":
      detail=communicationAction(s,cmd,actor,now);break;
    case "invoice.create": {
      const o = lookup(s.orders, cmd.orderId);
      if (o.status === "Cancelled")
        fail("Cancelled orders cannot be invoiced.");
      if (s.invoices.some((i) => i.orderId === o.id))
        fail("An invoice already exists for this order.");
      const i = createInvoice(s, o, now);
      event("invoice.created", i.id);
      detail = i.number;
      break;
    }
    case "invoice.refreshBusiness":
    case "invoice.edit":
    case "invoice.submit":
    case "invoice.approve":
    case "invoice.return":
    case "invoice.claim":
    case "invoice.complete":
    case "invoice.fail":
    case "invoice.demoSend":
      detail = invoiceAction(s, cmd, actor, now);
      break;
    case "report.call": {
      admin();
      const parsed = callRecordSchema.safeParse(cmd.record);
      if (!parsed.success)
        fail(
          "Check the call time, customer, outcome, reference, non-negative duration/charge and quality score (1–5).",
        );
      const data = parsed.data;
      lookup(s.customers, data.customerId);
      if (data.leadId) lookup(s.leads, data.leadId);
      if (
        s.callRecords.some(
          (c) => c.reference === data.reference && c.mode === data.mode,
        )
      )
        fail("This call reference has already been recorded.");
      if (data.outcome !== "Answered" && data.durationSeconds > 0)
        fail("Talk duration is only available for answered calls.");
      if (data.quality !== null && data.outcome !== "Answered")
        fail("Only answered calls can receive a conversation quality rating.");
      if (Date.parse(data.at) > Date.parse(now))
        fail("A completed call cannot be dated in the future.");
      if (data.mode === "Demo" && data.cost !== 0)
        fail("Simulated calls must have zero cost.");
      const id = uid();
      s.callRecords.unshift({
        ...data,
        id,
        recordedBy: actor.id,
        createdAt: now,
      });
      event("call.recorded", id);
      detail = data.reference;
      break;
    }
    case "report.expense": {
      admin();
      const parsed = expenseSchema.safeParse(cmd.expense);
      if (!parsed.success)
        fail(
          "Enter a valid expense date, category, positive INR amount and invoice reference.",
        );
      const data = parsed.data;
      if (
        new Date(data.date + "T00:00:00Z").toISOString().slice(0, 10) !==
        data.date
      )
        fail("Invalid expense date.");
      if (data.date > localDay(now, s.settings.timezone))
        fail(
          "Record expenses on or before today; future invoices are not recorded spending.",
        );
      if (
        s.expenses.some(
          (e) => e.reference === data.reference && e.category === data.category,
        )
      )
        fail("This expense reference has already been recorded.");
      const id = uid();
      s.expenses.unshift({ ...data, id, recordedBy: actor.id, createdAt: now });
      event("expense.recorded", id);
      detail = data.category + " / " + data.reference;
      break;
    }
    case "lead.capture": {
      const input = leadInput.parse(cmd.lead);
      const customer = lookup(s.customers, input.customerId);
      if (
        s.leads.some(
          (l) =>
            l.status === "Opted out" &&
            (l.customerId === customer.id ||
              [l.phone, l.whatsapp]
                .filter(Boolean)
                .some((n) => n === customer.phone || n === input.whatsapp)),
        )
      )
        fail("Contact has opted out. Do not create a new outreach lead.");
      if (!customer.phone && !input.whatsapp && !customer.email)
        fail("Provide at least one contact channel.");
      if (
        input.sourceReference &&
        s.leads.some(
          (l) =>
            l.source === input.source &&
            l.sourceReference === input.sourceReference,
        )
      )
        fail("This source record has already been captured.");
      if (
        s.leads.some(
          (l) =>
            l.customerId === input.customerId &&
            !["Converted", "Not interested", "Opted out"].includes(l.status),
        )
      )
        fail("This customer already has an open lead. Update it instead.");
      const lead: Lead = {
        ...input,
        solarProfile: solarProfileSchema.parse(input.solarProfile || {}),
        phone: customer.phone,
        id: uid(),
        interest: "Unknown",
        status: "Captured",
        callConsent: "",
        scheduledAt: "",
        language: "English",
        attempts: 0,
        requirements: "",
        enquiryId: "",
        createdAt: now,
        updatedAt: now,
      };
      s.leads.unshift(lead);
      event("lead.captured", lead.id);
      detail = lead.id;
      break;
    }
    case "lead.qualify": {
      const l = lookup(s.leads, cmd.id);
      if (["Converted", "Opted out"].includes(l.status))
        fail("This lead is closed.");
      const response = z
        .enum([
          "Awaiting reply",
          "Products",
          "Services",
          "Not interested",
          "Opted out",
        ])
        .parse(cmd.response);
      const evidence = z.string().trim().min(1).max(2000).parse(cmd.evidence);
      if (
        response === "Awaiting reply" &&
        (!l.whatsapp || !l.whatsappConsent.trim())
      )
        fail(
          "Record WhatsApp permission before preparing qualification contact.",
        );
      l.interest =
        response === "Products" || response === "Services"
          ? response
          : "Unknown";
      l.status =
        response === "Products" || response === "Services"
          ? "Qualified"
          : response;
      l.scheduledAt = "";
      l.callConsent = "";
      if (response === "Products" || response === "Services")
        l.phone = lookup(s.customers, l.customerId).phone;
      l.notes = evidence;
      l.updatedAt = now;
      event("lead.qualified", l.id);
      detail = l.id;
      break;
    }
    case "lead.schedule": {
      const l = lookup(s.leads, cmd.id);
      if (!["Qualified", "Scheduled"].includes(l.status))
        fail("Confirm interest before scheduling a call.");
      if(s.communicationJobs?.some(j=>j.leadId===l.id&&["Starting","Accepted","Uncertain"].includes(j.status)&&j.kind==="Voice"))fail("An active or uncertain call must be reconciled before rescheduling.");
      const customer = lookup(s.customers, l.customerId);
      phoneSchema.parse(customer.phone);
      if (l.phone && l.phone !== customer.phone)
        fail(
          "Contact number changed. Record a new qualification response and call agreement.",
        );
      if (
        s.leads.some(
          (other) =>
            other.status === "Opted out" &&
            (other.customerId === customer.id ||
              [other.phone, other.whatsapp]
                .filter(Boolean)
                .includes(customer.phone)),
        )
      )
        fail("This contact has opted out of outreach.");
      const at = z.iso.datetime().parse(cmd.at);
      if (Date.parse(at) <= Date.parse(now))
        fail("Choose a future customer-agreed call time.");
      l.callConsent = z.string().trim().min(1).max(1000).parse(cmd.consent);
      l.language = z.string().trim().min(1).max(80).parse(cmd.language);
      l.scheduledAt = at;
      l.status = "Scheduled";
      l.updatedAt = now;
      event("call.scheduled", l.id);
      detail = l.id;
      break;
    }
    case "lead.simulateDue": {
      const due = s.leads
        .filter(
          (l) =>
            l.status === "Scheduled" &&
            l.callConsent &&
            Date.parse(l.scheduledAt) <= Date.parse(now) &&
            l.attempts < 2,
        )
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 2);
      for (const l of due) {
        l.attempts++;
        l.status = "Details captured";
        l.requirements =
          l.interest === "Services"
            ? "Service request: site survey and installation. Staff review required."
            : "20 pcs 540 W panels; 1 pcs 5 kW inverter";
        l.notes =
          "SIMULATED call only. These are synthetic answers, not a customer transcript. Verify all requirements with staff.";
        l.updatedAt = now;
        s.callRecords.push({
          id: uid(),
          customerId: l.customerId,
          leadId: l.id,
          at: now,
          mode: "Demo",
          outcome: "Answered",
          durationSeconds: 0,
          reference: "demo-" + l.id + "-" + l.attempts,
          notes: "Synthetic text simulation; not an actual phone call",
          cost: 0,
          quality: null,
          recordedBy: actor.id,
          createdAt: now,
        });
        event("call.simulated", l.id);
      }
      detail = "Simulated due calls: " + due.length;
      break;
    }
    case "lead.simulate": {
      const l = lookup(s.leads, cmd.id);
      if (
        l.status !== "Scheduled" ||
        !l.callConsent ||
        Date.parse(l.scheduledAt) > Date.parse(now)
      )
        fail("Only a due, consented scheduled call can run.");
      if (l.attempts >= 2) fail("Attempt limit reached. Staff must review.");
      l.attempts++;
      l.status = "Details captured";
      l.requirements =
        l.interest === "Services"
          ? "Service request: site survey and installation. Staff review required; no service catalogue is implemented."
          : "20 pcs 540 W panels; 1 pcs 5 kW inverter";
      l.notes =
        "SIMULATED call only. Requirements are synthetic, not a customer transcript. Verify product quantities, phase, voltage, destination, delivery date and commercial details before quoting.";
      l.updatedAt = now;
      s.callRecords.push({
        id: uid(),
        customerId: l.customerId,
        leadId: l.id,
        at: now,
        mode: "Demo",
        outcome: "Answered",
        durationSeconds: 0,
        reference: "demo-" + l.id + "-" + l.attempts,
        notes: "Synthetic text simulation; not an actual phone call",
        cost: 0,
        quality: null,
        recordedBy: actor.id,
        createdAt: now,
      });
      event("call.simulated", l.id);
      detail = l.id;
      break;
    }
    case "lead.requirements": {
      const l = lookup(s.leads, cmd.id);
      if (!["Qualified", "Scheduled", "Details captured"].includes(l.status))
        fail("Confirm interest before recording a conversation.");
      l.requirements = z.string().trim().min(1).max(12000).parse(cmd.text);
      l.status = "Details captured";
      l.updatedAt = now;
      event("call.details", l.id);
      detail = l.id;
      break;
    }
    case "lead.promote": {
      const l = lookup(s.leads, cmd.id);
      if (l.enquiryId) fail("An enquiry already exists for this lead.");
      if (l.status !== "Details captured" || l.interest !== "Products")
        fail(
          "Capture and review product requirements first. Service requests need staff handling.",
        );
      const data = extractionSchema.parse(cmd.extraction);
      const id = uid();
      s.enquiries.unshift({
        id,
        customerId: l.customerId,
        text: l.requirements,
        ...data,
        status: "New",
        assigned: actor.id,
        nextAction: "Review call requirements and select catalogue products",
        due: localDay(now, s.settings.timezone),
        lastContact: now,
        notes: "Created from lead " + l.id,
        lostReason: "",
        createdAt: now,
        updatedAt: now,
      });
      s.followups.push({
        id: uid(),
        enquiryId: id,
        due: localDay(now, s.settings.timezone),
        assigned: actor.id,
        completedAt: "",
      });
      l.enquiryId = id;
      l.status = "Converted";
      l.updatedAt = now;
      event("enquiry.created", id);
      event("lead.converted", l.id);
      detail = id;
      break;
    }
    case "customer.save": {
      const c = customerSchema.parse(cmd.customer);
      if (Object.keys(c.priceList).length) admin();
      const i = s.customers.findIndex((x) => x.id === c.id);
      if (actor.role === "sales" && i >= 0)
        c.priceList = s.customers[i].priceList;
      if (i < 0) s.customers.push(c);
      else s.customers[i] = c;
      detail = c.company;
      break;
    }
    case "product.save": {
      admin();
      const p = productSchema.parse(cmd.product);
      if (
        s.products.some(
          (x) => x.sku.toLowerCase() === p.sku.toLowerCase() && x.id !== p.id,
        )
      )
        fail("SKU already exists. Choose a unique SKU.");
      const old = s.products.find((x) => x.id === p.id);
      if (old && (p.physical !== old.physical || p.reserved !== old.reserved))
        fail("Use a stock adjustment to change quantities.");
      if (!old && p.reserved !== 0)
        fail("New products cannot have reservations.");
      const i = s.products.findIndex((x) => x.id === p.id);
      if (i < 0) s.products.push(p);
      else s.products[i] = p;
      detail = p.sku;
      break;
    }
    case "stock.adjust": {
      admin();
      const p = lookup(s.products, cmd.id);
      const n = z.number().int().nonnegative().parse(cmd.physical);
      if (!String(cmd.reason || "").trim())
        fail("Enter a reason for this stock adjustment.");
      if (n < p.reserved)
        fail("Physical stock cannot be below reserved stock.");
      detail = `${p.sku}: ${p.physical} → ${n}; ${String(cmd.reason).slice(0, 500)}`;
      p.physical = n;
      p.stockAt = now;
      break;
    }
    case "import": {
      admin();
      const rows = z.array(z.unknown()).max(2000).parse(cmd.rows);
      if (cmd.kind === "products") {
        for (const row of rows) {
          const p = productSchema.parse(row);
          if (
            s.products.some((x) => x.sku.toLowerCase() === p.sku.toLowerCase())
          )
            fail(
              `Duplicate SKU: ${p.sku}. Imports only add new SKUs; adjust existing stock with a reason.`,
            );
          if (p.reserved !== 0) fail("Imports cannot set reservations.");
          s.products.push(p);
        }
      } else if (cmd.kind === "customers") {
        for (const row of rows) {
          const c = customerSchema.parse(row);
          if (
            s.customers.some(
              (x) => x.company.toLowerCase() === c.company.toLowerCase(),
            )
          )
            fail(`Duplicate customer: ${c.company}`);
          s.customers.push(c);
        }
      } else fail("Unsupported import.");
      detail = `${rows.length} ${cmd.kind} rows`;
      break;
    }
    case "enquiry.create": {
      const data = extractionSchema.parse(cmd.extraction);
      const text = z.string().max(12000).parse(cmd.text);
      const customerId = z.string().parse(cmd.customerId);
      lookup(s.customers, customerId);
      const id = uid();
      s.enquiries.unshift({
        id,
        customerId,
        text,
        ...data,
        status: "New",
        assigned: actor.id,
        nextAction: "Review requirements and select products",
        due: localDay(now, s.settings.timezone),
        lastContact: "",
        notes: "",
        lostReason: "",
        createdAt: now,
        updatedAt: now,
      });
      s.followups.push({
        id: uid(),
        enquiryId: id,
        due: localDay(now, s.settings.timezone),
        assigned: actor.id,
        completedAt: "",
      });
      event("enquiry.created", id);
      detail = id;
      break;
    }
    case "enquiry.update": {
      const e = lookup(s.enquiries, cmd.id);
      const patch = z
        .object({
          status: z.enum(stages).optional(),
          assigned: z.string().optional(),
          nextAction: z.string().max(500).optional(),
          due: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          notes: z.string().max(4000).optional(),
          lostReason: z.string().max(500).optional(),
          lastContact: z.string().optional(),
        })
        .parse(cmd.patch);
      if (
        patch.status &&
        ["Approved", "Sent", "Won", "Draft quote"].includes(patch.status)
      )
        fail("Use quotation or order actions for this stage.");
      if (patch.status === "Lost" && !patch.lostReason?.trim())
        fail("Enter the reason this deal was lost.");
      if (patch.assigned && !s.users.some((u) => u.id === patch.assigned))
        fail("Choose a business user.");
      if (patch.due && patch.due !== e.due)
        s.followups.push({
          id: uid(),
          enquiryId: e.id,
          due: patch.due,
          assigned: patch.assigned || e.assigned,
          completedAt: "",
        });
      if (patch.lastContact) {
        s.followups
          .filter((f) => f.enquiryId === e.id && !f.completedAt)
          .forEach((f) => (f.completedAt = now));
        patch.lastContact = now;
        event(
          "followup.completed",
          e.id,
          new Date(localDay(now, s.settings.timezone)).getTime() <=
            new Date(e.due).getTime()
            ? 1
            : 0,
        );
      }
      Object.assign(e, patch, { updatedAt: now });
      detail = e.id;
      break;
    }
    case "quote.create": {
      const e = lookup(s.enquiries, cmd.enquiryId);
      const selections = z
        .array(z.object({ productId: z.string(), quantity: z.string() }))
        .min(1)
        .max(40)
        .parse(cmd.selections);
      const customer = lookup(s.customers, e.customerId);
      const lines = selections.map((l) => {
        const p = lookup(s.products, l.productId);
        if (!p.active) fail("Choose an active product.");
        qty(l.quantity);
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          quantity: l.quantity,
          price: customer.priceList[p.id] ?? p.price,
          discountBps: 0,
          taxBps: p.taxBps ?? s.settings.taxBps,
          cost: p.cost,
        };
      });
      const id = uid();
      s.quotes.unshift({
        id,
        number: `${s.settings.prefix}${String(s.quotes.filter((q) => q.revision === 1).length + 1).padStart(4, "0")}`,
        enquiryId: e.id,
        customerId: e.customerId,
        revision: 1,
        lines,
        delivery: 0,
        deliveryTaxBps: s.settings.deliveryTaxBps,
        terms: s.settings.paymentTerms + "\n" + s.settings.deliveryTerms,
        deliveryEstimate: "To be confirmed",
        validUntil: new Date(Date.parse(now) + s.settings.validDays * 86400000)
          .toISOString()
          .slice(0, 10),
        status: "Draft",
        createdAt: now,
        approvedAt: "",
        approvedBy: "",
        sentAt: "",
        corrected: false,
      });
      e.status = "Draft quote";
      event(
        "quote.drafted",
        id,
        (Date.parse(now) - Date.parse(e.createdAt)) / 60000,
      );
      detail = id;
      break;
    }
    case "quote.edit": {
      const q = lookup(s.quotes, cmd.id);
      if (s.orders.some((o) => o.quoteId === q.id && o.status !== "Cancelled"))
        fail(
          "This quotation has an order. Create a new enquiry for additional sales.",
        );
      if (q.status === "Superseded") fail("Edit the latest revision.");
      const patch = z
        .object({
          lines: z
            .array(
              z.object({
                productId: z.string(),
                quantity: z.string(),
                price: z.number().int().nonnegative().max(100000000),
                discountBps: z.number().int().min(0).max(10000),
                taxBps: z.number().int().min(0).max(10000).nullable(),
              }),
            )
            .min(1)
            .max(40),
          delivery: z.number().int().nonnegative().max(100000000),
          deliveryTaxBps: z.number().int().min(0).max(10000).nullable(),
          terms: z.string().max(4000),
          deliveryEstimate: z.string().max(500),
          validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(cmd.patch);
      const lines = patch.lines.map((l) => {
        qty(l.quantity);
        const p = lookup(s.products, l.productId);
        return { ...l, name: p.name, sku: p.sku, unit: p.unit, cost: p.cost };
      });
      const corrected =
        JSON.stringify(q.lines.map((l) => [l.productId, l.quantity])) !==
        JSON.stringify(lines.map((l) => [l.productId, l.quantity]));
      if (q.status !== "Draft") {
        q.status = "Superseded";
        s.quotes.unshift({
          ...q,
          ...patch,
          lines,
          id: uid(),
          revision: q.revision + 1,
          status: "Draft",
          approvedAt: "",
          approvedBy: "",
          sentAt: "",
          corrected: q.corrected || corrected,
        });
      } else
        Object.assign(q, patch, { lines, corrected: q.corrected || corrected });
      lookup(s.enquiries, q.enquiryId).status = "Draft quote";
      if (corrected) event("draft.corrected", q.enquiryId);
      detail = q.number;
      break;
    }
    case "quote.approve": {
      admin();
      const q = lookup(s.quotes, cmd.id);
      if (q.status !== "Draft") fail("Only a draft can be approved.");
      const w = warnings(q, s);
      if (w.length && !String(cmd.reason || "").trim())
        fail(`Review warnings and provide an approval reason: ${w.join("; ")}`);
      if (!q.lines.length || !q.customerId) fail("Add customer and products.");
      totals(q.lines, q.delivery, q.deliveryTaxBps);
      q.status = "Approved";
      q.approvedBy = actor.id;
      q.approvedAt = now;
      lookup(s.enquiries, q.enquiryId).status = "Approved";
      event(
        "quote.approved",
        q.id,
        (Date.parse(now) -
          Date.parse(lookup(s.enquiries, q.enquiryId).createdAt)) /
          60000,
      );
      detail = q.number + " " + String(cmd.reason || "");
      break;
    }
    case "quote.sent": {
      const q = lookup(s.quotes, cmd.id);
      if (q.status !== "Approved")
        fail("Approve this revision before marking it sent.");
      q.status = "Sent";
      q.sentAt = now;
      const e = lookup(s.enquiries, q.enquiryId);
      e.status = "Sent";
      e.lastContact = now;
      e.nextAction = "Confirm receipt and delivery requirements";
      e.due = new Date(Date.parse(now) + 2 * 86400000)
        .toISOString()
        .slice(0, 10);
      s.followups.push({
        id: uid(),
        enquiryId: e.id,
        due: e.due,
        assigned: e.assigned,
        completedAt: "",
      });
      event("quote.sent", q.id);
      detail = q.number;
      break;
    }
    case "order.create": {
      const q = lookup(s.quotes, cmd.id);
      if (s.orders.some((o) => o.quoteId === q.id))
        fail("An order already exists for this quotation.");
      if (!["Approved", "Sent"].includes(q.status))
        fail("Approve the latest quotation before conversion.");
      if (q.validUntil < localDay(now, s.settings.timezone))
        fail("Quotation expired. Revise and approve it before conversion.");
      const demand = new Map<string, number>();
      q.lines.forEach((l) =>
        demand.set(
          l.productId,
          (demand.get(l.productId) || 0) + qty(l.quantity),
        ),
      );
      for (const [id, n] of [...demand].sort()) {
        const p = lookup(s.products, id);
        if (!p.active || p.physical - p.reserved < n)
          fail(
            `${p.sku}: not enough stock. Adjust the order or record a verified stock receipt.`,
          );
        p.reserved += n;
      }
      const total = totals(q.lines, q.delivery, q.deliveryTaxBps).total;
      const id = uid();
      s.orders.unshift({
        id,
        quoteId: q.id,
        number: `SO-${String(s.orders.length + 1).padStart(4, "0")}`,
        customerId: q.customerId,
        lines: structuredClone(q.lines),
        total,
        status: "Confirmed",
        createdAt: now,
      });
      lookup(s.enquiries, q.enquiryId).status = "Won";
      const invoice = createInvoice(s, s.orders[0], now);
      event("invoice.created", invoice.id);
      event("order.created", id);
      detail = id;
      break;
    }
    case "order.status": {
      const o = lookup(s.orders, cmd.id);
      const status = z
        .enum(["Preparing", "Dispatched", "Delivered", "Cancelled"])
        .parse(cmd.status);
      const allowed: Record<string, string[]> = {
        Confirmed: ["Preparing", "Cancelled"],
        Preparing: ["Dispatched", "Cancelled"],
        Dispatched: ["Delivered"],
        Delivered: [],
        Cancelled: [],
      };
      if (!allowed[o.status].includes(status))
        fail("This order transition is not allowed.");
      if (
        status === "Cancelled" &&
        s.invoices.some(
          (i) =>
            i.orderId === o.id &&
            ["Sending", "Sent", "Demo sent", "Failed"].includes(i.status),
        )
      )
        fail(
          "Invoice delivery has started. Review invoice/credit handling before cancelling this order.",
        );
      if (status === "Cancelled")
        s.invoices
          .filter((i) => i.orderId === o.id)
          .forEach((i) => {
            i.status = "Voided";
            event("invoice.voided", i.id);
          });
      if (status === "Cancelled" || status === "Dispatched") {
        if (status === "Cancelled" && !String(cmd.reason || "").trim())
          fail("Enter a cancellation reason.");
        for (const l of o.lines) {
          const p = lookup(s.products, l.productId),
            n = qty(l.quantity);
          p.reserved -= n;
          if (status === "Dispatched") {
            p.physical -= n;
            p.stockAt = now;
          }
        }
      }
      o.status = status;
      event("order." + status.toLowerCase(), o.id);
      if (status === "Cancelled") {
        const q = lookup(s.quotes, o.quoteId);
        const e = lookup(s.enquiries, q.enquiryId);
        e.status = "Follow-up due";
        e.nextAction =
          "Discuss cancellation and whether a revised quote is needed";
        e.due = localDay(now, s.settings.timezone);
        s.followups.push({
          id: uid(),
          enquiryId: e.id,
          due: e.due,
          assigned: e.assigned,
          completedAt: "",
        });
      }
      detail = o.number + " " + status + " " + String(cmd.reason || "");
      break;
    }
    case "settings.save": {
      admin();
      const patch = z
        .object({
          name: z.string().min(1).max(200),
          address: z.string().max(1000),
          contact: z.string().max(200),
          gstin: z.string().max(30),
          currency: z.enum(["INR"]),
          timezone: z.string().max(80),
          taxBps: z.number().int().min(0).max(10000).nullable(),
          deliveryTaxBps: z.number().int().min(0).max(10000).nullable(),
          prefix: z.string().min(1).max(20),
          validDays: z.number().int().min(1).max(365),
          paymentTerms: z.string().max(2000),
          deliveryTerms: z.string().max(2000),
          marginBps: z.number().int().min(0).max(10000),
          stockStaleDays: z.number().int().min(1).max(365),
          subscription: z.enum(["Pilot", "Active", "Past due", "Cancelled"]),
          renewal: z.string(),
          fee: z.number().int().nonnegative(),
          allowance: z.number().int().min(0).max(100000),
          userLimit: z.number().int().min(1).max(100),
          spendCeilingMicros: z.number().int().nonnegative().max(1000000000),
          baseline: z.object({
            prepMinutes: z.string(),
            followupPercent: z.string(),
            correctionPercent: z.string(),
            conversionPercent: z.string(),
            weeklyUsers: z.string(),
          }),
        })
        .parse(cmd.settings);
      new Intl.DateTimeFormat("en", { timeZone: patch.timezone });
      s.settings = patch;
      detail = "Business settings and manual subscription record";
      break;
    }
    default:
      fail("Unknown action.");
  }
  s.audit.unshift({
    id: uid(),
    at: now,
    user: actor.id,
    action: cmd.type,
    detail,
  });
  event("activity", detail);
  return s;
}
export function visibleState(s: State, role: Role): State {
  if (role === "admin") return s;
  const x = structuredClone(s);
  x.products.forEach((p) => (p.cost = null));
  x.quotes.forEach((q) => q.lines.forEach((l) => (l.cost = null)));
  x.orders.forEach((o) => o.lines.forEach((l) => (l.cost = null)));
  x.customers.forEach((c) => (c.priceList = {}));
  x.audit = [];
  x.expenses = [];
  x.callRecords = [];
  x.communicationJobs?.forEach(j=>{j.estimatedCost=null;});
  return x;
}
