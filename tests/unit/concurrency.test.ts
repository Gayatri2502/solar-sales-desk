import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { seed } from "../../src/seed";
import { reduce } from "../../src/domain";
import { mutate } from "../../server/worker";

it("concurrent order attempts reserve once and cancellation releases stock transactionally", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile("supabase/migrations/001_initial.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/migrations/002_admin_reports.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/migrations/003_invoices.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/migrations/004_communications.sql", "utf8"),
    );
    const id = "11111111-1111-4111-8111-111111111111";
    await db.query("insert into auth.users values ($1)", [id]);
    const actor = { id, role: "admin" as const };
    let s = seed();
    s.users = [{ id, name: "Admin", role: "admin" }];
    s.settings.taxBps = 0;
    s.settings.deliveryTaxBps = 0;
    s.products[0].physical = 20000;
    const quotes: string[] = [];
    for (const e of s.enquiries) {
      s = reduce(
        s,
        {
          type: "quote.create",
          enquiryId: e.id,
          selections: [{ productId: "p0", quantity: "20" }],
        },
        actor,
      );
      quotes.push(s.quotes[0].id);
      s = reduce(
        s,
        {
          type: "quote.approve",
          id: s.quotes[0].id,
          reason: "Synthetic test reviewed",
        },
        actor,
      );
    }
    const tenant = (
      await db.query<{ id: string }>(
        "select onboard_business($1,$2,$3::jsonb) id",
        [id, "Test", JSON.stringify(s)],
      )
    ).rows[0].id as string;
    const adapter = {
      from: () => ({
        select: () => ({
          eq: (_field: string, t: string) => ({
            single: async () => {
              const r = await db.query(
                "select state,revision from tenant_states where tenant_id=$1",
                [t],
              );
              return { data: r.rows[0], error: null };
            },
          }),
        }),
      }),
      rpc: async (_name: string, p: any) => {
        const r = await db.query<{ ok: boolean }>(
          "select commit_state($1,$2,$3,$4::jsonb,$5) ok",
          [
            p.p_tenant,
            p.p_user,
            p.p_revision,
            JSON.stringify(p.p_state),
            p.p_action,
          ],
        );
        return { data: r.rows[0].ok, error: null };
      },
    };
    const results = await Promise.allSettled(
      quotes.map((q) =>
        mutate(
          adapter as any,
          { ...actor, tenant },
          { type: "order.create", id: q },
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const read = async () =>
      (
        await db.query<{ state: typeof s }>(
          "select state from tenant_states where tenant_id=$1",
          [tenant],
        )
      ).rows[0].state as typeof s;
    const reserved = await read();
    expect(reserved.orders).toHaveLength(1);
    expect(reserved.invoices).toHaveLength(1);
    expect(reserved.products[0].reserved).toBe(20000);
    await expect(
      mutate(
        adapter as any,
        { ...actor, tenant },
        { type: "order.create", id: reserved.orders[0].quoteId },
      ),
    ).rejects.toThrow();
    await mutate(
      adapter as any,
      { ...actor, tenant },
      {
        type: "order.status",
        id: reserved.orders[0].id,
        status: "Cancelled",
        reason: "Synthetic cancellation",
      },
    );
    expect((await read()).products[0].reserved).toBe(0);
    expect((await read()).products[0].physical).toBe(20000);
    const losingQuote = quotes.find((q) => q !== reserved.orders[0].quoteId)!;
    let next = await mutate(
      adapter as any,
      { ...actor, tenant },
      { type: "order.create", id: losingQuote },
    );
    const invoice = next.invoices!.find(
      (i) => i.orderId === next.orders[0].id,
    )!;
    await mutate(
      adapter as any,
      { ...actor, tenant },
      { type: "invoice.submit", id: invoice.id },
    );
    await mutate(
      adapter as any,
      { ...actor, tenant },
      { type: "invoice.approve", id: invoice.id },
    );
    const claims = await Promise.allSettled(
      ["lease-a", "lease-b"].map((lease) =>
        mutate(
          adapter as any,
          { ...actor, tenant },
          { type: "invoice.claim", id: invoice.id, lease },
        ),
      ),
    );
    expect(claims.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    const current = (await read()).invoices!.find((i) => i.id === invoice.id)!;
    expect(current.attempts).toBe(1);
    expect(current.status).toBe("Sending");
  } finally {
    await db.close();
  }
}, 20000);
