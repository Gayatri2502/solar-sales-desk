import { type SupabaseClient } from "@supabase/supabase-js";
import { type Invoice, invoiceHTML } from "../src/invoices";
import { type State, type Command, uid } from "../src/domain";
export type EmailEnv = {
  INVOICE_EMAIL_ENABLED?: string;
  RESEND_API_KEY?: string;
  INVOICE_FROM_EMAIL?: string;
};
export async function sendInvoice(
  i: Invoice,
  tenant: string,
  env: EmailEnv,
  transport: typeof fetch = fetch,
) {
  if (
    env.INVOICE_EMAIL_ENABLED !== "true" ||
    !env.RESEND_API_KEY ||
    !env.INVOICE_FROM_EMAIL
  )
    throw Error("Invoice email is not configured.");
  if (i.status !== "Sending" || !i.approvedBy)
    throw Error("Approved delivery lease required.");
  const r = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice/${tenant}/${i.id}/${i.revision}`,
    },
    body: JSON.stringify({
      from: env.INVOICE_FROM_EMAIL,
      to: [i.customer.email],
      subject: `Invoice ${i.number} — ${i.seller.name}`,
      html: invoiceHTML(i),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Email provider did not confirm acceptance.");
  const data = (await r.json()) as { id?: string };
  if (!data.id || typeof data.id !== "string")
    throw Error("Email provider response invalid.");
  return data.id;
}
export async function deliverInvoices(
  db: SupabaseClient,
  tenant: string,
  env: EmailEnv,
  mutate: (
    db: SupabaseClient,
    ctx: { tenant: string; id: string; role: "admin" },
    cmd: Command,
  ) => Promise<State>,
  onlyId?: string,
) {
  if (
    env.INVOICE_EMAIL_ENABLED !== "true" ||
    !env.RESEND_API_KEY ||
    !env.INVOICE_FROM_EMAIL
  )
    return;
  const snapshot = await db
    .from("tenant_states")
    .select("state")
    .eq("tenant_id", tenant)
    .single();
  if (snapshot.error) return;
  const invoices = ((snapshot.data.state as State).invoices || [])
    .filter(
      (i) =>
        (!onlyId || i.id === onlyId) &&
        ["Approved", "Failed", "Sending"].includes(i.status) &&
        i.approvedBy &&
        i.attempts < 3 &&
        (!i.firstAttemptAt ||
          Date.now() - Date.parse(i.firstAttemptAt) < 23 * 3600000),
    )
    .slice(0, 2);
  for (const i of invoices) {
    const ctx = { tenant, id: i.approvedBy, role: "admin" as const },
      lease = uid();
    try {
      const allowance = await db.rpc("reserve_invoice_email", {
        p_tenant: tenant,
        p_actor: i.approvedBy,
        p_invoice: i.id,
        p_revision: i.revision,
      });
      if (allowance.error) continue;
      const claimed = await mutate(db, ctx, {
        type: "invoice.claim",
        id: i.id,
        lease,
      });
      const current = claimed.invoices!.find((x) => x.id === i.id)!;
      let providerId: string;
      try {
        providerId = await sendInvoice(current, tenant, env);
      } catch {
        await mutate(db, ctx, { type: "invoice.fail", id: i.id, lease });
        continue;
      }
      await mutate(db, ctx, {
        type: "invoice.complete",
        id: i.id,
        lease,
        providerId,
      });
    } catch {
      /* No customer content, addresses or provider secrets in operational logs. Persisted lease can recover within the idempotency window. */
    }
  }
}
