import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
const [action, arg1, arg2, apply] = process.argv.slice(2);
const product = z.looseObject({
  id: z.string(),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["Panel", "Inverter", "Battery", "Mounting", "Accessory"]),
  unit: z.string().min(1),
  price: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative().nullable(),
  taxBps: z.number().int().min(0).max(10000).nullable(),
  physical: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});
function validate(s) {
  if (
    s.version !== 1 ||
    !s.settings ||
    !Array.isArray(s.quotes) ||
    !Array.isArray(s.orders) ||
    !Array.isArray(s.enquiries) ||
    !Array.isArray(s.audit) ||
    !Array.isArray(s.events) ||
    !Array.isArray(s.usage) ||
    !Array.isArray(s.users)
  )
    throw Error("Unsupported backup schema.");
  const products = z.array(product).parse(s.products);
  const productIds = new Set(products.map((p) => p.id));
  if (
    productIds.size !== products.length ||
    new Set(products.map((p) => p.sku)).size !== products.length
  )
    throw Error("Duplicate products.");
  const customers = z
    .array(z.looseObject({ id: z.string(), company: z.string().min(1) }))
    .parse(s.customers);
  const customerIds = new Set(customers.map((c) => c.id));
  const qids = new Set(s.quotes.map((q) => q.id));
  const eids = new Set(s.enquiries.map((e) => e.id));
  const reserved = new Map();
  for (const q of s.quotes) {
    if (!customerIds.has(q.customerId) || !eids.has(q.enquiryId))
      throw Error("Invalid quotation references.");
    for (const l of q.lines) {
      if (
        !productIds.has(l.productId) ||
        !/^\d+(\.\d{1,3})?$/.test(l.quantity) ||
        Number(l.quantity) <= 0 ||
        !Number.isSafeInteger(l.price) ||
        l.price < 0 ||
        l.discountBps < 0 ||
        l.discountBps > 10000 ||
        (l.taxBps !== null && (l.taxBps < 0 || l.taxBps > 10000))
      )
        throw Error("Invalid quote line.");
    }
  }
  for (const o of s.orders) {
    if (!qids.has(o.quoteId) || !customerIds.has(o.customerId))
      throw Error("Invalid order references.");
    if (["Confirmed", "Preparing"].includes(o.status))
      for (const l of o.lines) {
        const [a, b = ""] = l.quantity.split(".");
        const n = Number(a) * 1000 + Number(b.padEnd(3, "0"));
        reserved.set(l.productId, (reserved.get(l.productId) || 0) + n);
      }
  }
  for (const p of products) {
    if (p.reserved !== (reserved.get(p.id) || 0) || p.physical < p.reserved)
      throw Error("Stock reconciliation failed.");
  }
  if (s.invoices !== undefined) {
    const ids = new Set(),
      orders = new Set(s.orders.map((o) => o.id));
    if (!Array.isArray(s.invoices)) throw Error("Invalid invoice records.");
    for (const i of s.invoices) {
      if (
        !orders.has(i.orderId) ||
        ids.has(i.id) ||
        !Number.isSafeInteger(i.total) ||
        !Array.isArray(i.lines) ||
        i.lines.some((l) => Object.hasOwn(l, "cost"))
      )
        throw Error("Invalid invoice references or private data.");
      ids.add(i.id);
    }
  }
  return s;
}
try {
  if (action === "validate") {
    validate(JSON.parse(await readFile(arg1, "utf8")));
    console.log("Backup structure and stock references validated.");
    process.exit(0);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Server credentials required in a secure env file.");
  if (!z.uuid().safeParse(arg1).success)
    throw Error("Provide the exact tenant UUID.");
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("tenant_states")
    .select("state,revision")
    .eq("tenant_id", arg1)
    .single();
  if (error) throw Error("Tenant not found or inaccessible.");
  if (action === "export") {
    await writeFile(arg2, JSON.stringify(data.state, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    console.log("Export created with restricted permissions.");
  } else if (action === "restore") {
    if (apply !== "--apply")
      throw Error("Restore requires --apply after backing up the destination.");
    const state = validate(JSON.parse(await readFile(arg2, "utf8")));
    for (const invoice of state.invoices || []) {
      if (["Approved", "Sending", "Failed"].includes(invoice.status)) {
        invoice.status = "Failed";
        invoice.attempts = 3;
        invoice.lease = "";
        invoice.error =
          "Restored invoice: reconcile provider delivery before any resend. Automatic delivery disabled for this record.";
      }
    }
    const result = await db.rpc("restore_state", {
      p_tenant: arg1,
      p_revision: data.revision,
      p_state: state,
    });
    if (result.error || !result.data)
      throw Error("Restore failed or concurrent change detected.");
    console.log("Business state restored. Current membership retained.");
  } else throw Error("Use export, validate or restore.");
} catch {
  console.error(
    "Operation failed. Check arguments, backup structure, stock reconciliation and server configuration. No secrets are printed.",
  );
  process.exitCode = 1;
}
