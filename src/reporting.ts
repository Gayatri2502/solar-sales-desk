import { type State, localDay, totals } from "./domain";
import { z } from "zod";
export const callRecordSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().min(1),
  leadId: z.string().default(""),
  at: z.iso.datetime(),
  mode: z.enum(["Manual", "Live", "Demo"]),
  outcome: z.enum(["Answered", "Unanswered", "Busy", "Failed", "Cancelled"]),
  durationSeconds: z.number().int().min(0).max(36000),
  reference: z.string().trim().min(1).max(200),
  notes: z.string().max(1000).default(""),
  cost: z.number().int().min(0).max(100000000).nullable(),
  quality: z.number().int().min(1).max(5).nullable(),
});
export type CallRecord = z.infer<typeof callRecordSchema> & {
  id: string;
  recordedBy: string;
  createdAt: string;
};
export const expenseSchema = z.object({
  category: z.enum([
    "Telephony",
    "WhatsApp",
    "AI",
    "Hosting",
    "Database",
    "Storage",
    "Other",
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().min(1).max(100000000),
  reference: z.string().trim().min(1).max(200),
  notes: z.string().max(1000).default(""),
});
export type Expense = z.infer<typeof expenseSchema> & {
  id: string;
  recordedBy: string;
  createdAt: string;
};
export type AIReportDay = {
  day: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_micros: number;
  failed: number;
};
export type ReportPeriod = "Weekly" | "Monthly" | "Yearly";
export function periodRange(period: ReportPeriod, anchor: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(anchor) ||
    new Date(anchor + "T00:00:00Z").toISOString().slice(0, 10) !== anchor
  )
    throw Error("Choose a valid report date.");
  const d = new Date(anchor + "T00:00:00Z");
  let from: Date, to: Date;
  if (period === "Weekly") {
    from = new Date(d);
    from.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);
  } else if (period === "Monthly") {
    from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  } else {
    from = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    to = new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
export function summarize(
  s: State,
  from: string,
  to: string,
  aiDays?: AIReportDay[],
) {
  const inDate = (at: string) => {
    if (!at) return false;
    const d = localDay(at, s.settings.timezone);
    return d >= from && d <= to;
  };
  const enquiries = s.enquiries.filter((e) => inDate(e.createdAt));
  const firstQuotes = new Map<string, State["quotes"][number]>();
  for (const q of s.quotes) {
    const prior = firstQuotes.get(q.number);
    if (!prior || q.createdAt < prior.createdAt) firstQuotes.set(q.number, q);
  }
  const quotes = [...firstQuotes.values()].filter((q) => inDate(q.createdAt));
  const orders = s.orders.filter(
    (o) => inDate(o.createdAt) && o.status !== "Cancelled",
  );
  const cancelled = s.orders.filter(
    (o) => inDate(o.createdAt) && o.status === "Cancelled",
  );
  const quoteById = new Map(s.quotes.map((q) => [q.id, q]));
  const quotedEnquiries = new Set(s.quotes.map((q) => q.enquiryId));
  const wonEnquiries = new Set(
    s.orders
      .filter((o) => o.status !== "Cancelled")
      .map((o) => quoteById.get(o.quoteId)?.enquiryId)
      .filter(Boolean),
  );
  const cohortQuoted = enquiries.filter((e) => quotedEnquiries.has(e.id));
  const cohortWon = enquiries.filter((e) => wonEnquiries.has(e.id));
  let net = 0,
    tax = 0,
    delivery = 0,
    cost = 0,
    missingCostOrders = 0,
    unknownAmounts = 0;
  for (const o of orders) {
    const q = quoteById.get(o.quoteId);
    if (!q) {
      unknownAmounts++;
      continue;
    }
    try {
      const t = totals(o.lines, q.delivery, q.deliveryTaxBps);
      net += t.net;
      tax += t.tax;
      delivery += q.delivery;
      if (t.cost === null) missingCostOrders++;
      else cost += t.cost;
    } catch {
      unknownAmounts++;
    }
  }
  const real = (s.callRecords || []).filter(
    (c) => inDate(c.at) && c.mode !== "Demo" && c.outcome !== "Cancelled",
  );
  const simulated = (s.callRecords || []).filter(
    (c) => inDate(c.at) && c.mode === "Demo",
  );
  const legacySimulations = s.events.filter(
    (e) =>
      e.type === "call.simulated" &&
      inDate(e.at) &&
      !simulated.some((c) => c.leadId === e.entity && c.at === e.at),
  ).length;
  const reviewed = real.filter(
    (c) => c.outcome === "Answered" && c.quality !== null,
  );
  const answered = real.filter((c) => c.outcome === "Answered");
  const expenses = (s.expenses || []).filter(
    (e) => e.date >= from && e.date <= to,
  );
  const spending = expenses.reduce((n, e) => n + e.amount, 0);
  const ai = aiDays
    ? aiDays
        .filter((d) => d.day >= from && d.day <= to)
        .reduce(
          (a, d) => ({
            requests: a.requests + Number(d.requests),
            input: a.input + Number(d.input_tokens),
            output: a.output + Number(d.output_tokens),
            micros: a.micros + Number(d.estimated_micros),
            failed: a.failed + Number(d.failed),
          }),
          { requests: 0, input: 0, output: 0, micros: 0, failed: 0 },
        )
    : s.usage
        .filter((u) => inDate(u.at))
        .reduce(
          (a, u) => ({
            requests: a.requests + 1,
            input: a.input + u.inputTokens,
            output: a.output + u.outputTokens,
            micros: a.micros + u.estimatedMicros,
            failed: a.failed + (u.status === "failed" ? 1 : 0),
          }),
          { requests: 0, input: 0, output: 0, micros: 0, failed: 0 },
        );
  return {
    enquiries: enquiries.length,
    quotes: quotes.length,
    orders: orders.length,
    cancelled: cancelled.length,
    revisions: s.quotes.filter((q) => inDate(q.createdAt)).length,
    cohortQuoted: cohortQuoted.length,
    cohortWon: cohortWon.length,
    quoteConversion: enquiries.length
      ? cohortQuoted.length / enquiries.length
      : null,
    dealConversion: enquiries.length
      ? cohortWon.length / enquiries.length
      : null,
    orderValue: orders.reduce((n, o) => n + o.total, 0),
    net,
    tax,
    delivery,
    cost: missingCostOrders || unknownAmounts ? null : cost,
    knownCost: cost,
    missingCostOrders,
    unknownAmounts,
    grossMargin: missingCostOrders || unknownAmounts ? null : net - cost,
    calls: real.length,
    answered: answered.length,
    unattended: real.filter((c) => ["Unanswered", "Busy"].includes(c.outcome))
      .length,
    failed: real.filter((c) => c.outcome === "Failed").length,
    simulated: simulated.length + legacySimulations,
    quality: reviewed.length
      ? reviewed.reduce((n, c) => n + c.quality!, 0) / reviewed.length
      : null,
    reviewed: reviewed.length,
    talkSeconds: answered.reduce((n, c) => n + c.durationSeconds, 0),
    callCost: real.some((c) => c.cost === null)
      ? null
      : real.reduce((n, c) => n + (c.cost || 0), 0),
    unknownCallCosts: real.filter((c) => c.cost === null).length,
    expenses,
    spending: expenses.length ? spending : null,
    spendCategories: [...new Set(expenses.map((e) => e.category))].map(
      (category) => ({
        category,
        amount: expenses
          .filter((e) => e.category === category)
          .reduce((n, e) => n + e.amount, 0),
      }),
    ),
    ai,
  };
}
