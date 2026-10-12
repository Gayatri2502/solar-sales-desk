import { type State, localDay, totals } from "./domain";
export function graphData(s: State, from: string, to: string) {
  const inDate = (v: string) => {
    const d = localDay(v, s.settings.timezone);
    return d >= from && d <= to;
  };
  const enquiries = s.enquiries.filter((e) => inDate(e.createdAt));
  const firstQuotes = new Map<string, State["quotes"][number]>();
  for (const q of s.quotes) {
    const first = firstQuotes.get(q.number);
    if (!first || q.createdAt < first.createdAt) firstQuotes.set(q.number, q);
  }
  const quotes = [...firstQuotes.values()].filter((q) => inDate(q.createdAt));
  const orders = s.orders.filter(
    (o) => o.status !== "Cancelled" && inDate(o.createdAt),
  );
  const quotesById = new Map(s.quotes.map((q) => [q.id, q]));
  const enquiriesById = new Map(s.enquiries.map((e) => [e.id, e]));
  const usersById = new Map(s.users.map((u) => [u.id, u]));
  const productsById = new Map(s.products.map((p) => [p.id, p]));
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const buckets = new Map<
    string,
    {
      label: string;
      enquiries: number;
      quotes: number;
      orders: number;
      value: number;
    }
  >();
  for (let n = 0; n < days; n++) {
    const d = new Date(Date.parse(from) + n * 86400000)
      .toISOString()
      .slice(0, 10);
    const key = days > 32 ? d.slice(0, 7) : d;
    if (!buckets.has(key))
      buckets.set(key, {
        label: key,
        enquiries: 0,
        quotes: 0,
        orders: 0,
        value: 0,
      });
  }
  const bucket = (at: string) =>
    buckets.get(localDay(at, s.settings.timezone).slice(0, days > 32 ? 7 : 10));
  for (const e of enquiries) {
    const b = bucket(e.createdAt);
    if (b) b.enquiries++;
  }
  for (const q of quotes) {
    const b = bucket(q.createdAt);
    if (b) b.quotes++;
  }
  for (const o of orders) {
    const b = bucket(o.createdAt);
    if (b) {
      b.orders++;
      b.value += o.total;
    }
  }
  const categories = new Map<string, number>(),
    users = new Map<string, number>();
  for (const o of orders) {
    const q = quotesById.get(o.quoteId),
      e = enquiriesById.get(q?.enquiryId || "");
    const name = usersById.get(e?.assigned || "")?.name || "Unassigned";
    users.set(name, (users.get(name) || 0) + 1);
    for (const l of o.lines) {
      const category =
        productsById.get(l.productId)?.category || "Unavailable category";
      const net = totals([{ ...l, cost: null }]).net;
      categories.set(category, (categories.get(category) || 0) + net);
    }
  }
  return {
    trend: [...buckets.values()],
    stages: [...new Set(enquiries.map((e) => e.status))].map((label) => ({
      label,
      value: enquiries.filter((e) => e.status === label).length,
    })),
    categories: [...categories].map(([label, value]) => ({ label, value })),
    salespeople: [...users].map(([label, value]) => ({ label, value })),
  };
}
