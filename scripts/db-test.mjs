import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;`,
);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/001_initial.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/002_admin_reports.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/003_invoices.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(await readFile(new URL("../supabase/migrations/004_communications.sql", import.meta.url), "utf8"));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  sales = "33333333-3333-4333-8333-333333333333";
await db.query("insert into auth.users values ($1),($2),($3)", [a, b, sales]);
const state = {
  version: 1,
  settings: {
    timezone: "Asia/Kolkata",
    userLimit: 5,
    allowance: 2,
    spendCeilingMicros: 1000,
    subscription: "Pilot",
  },
  users: [],
  products: [],
};
async function onboard(user, name) {
  return (
    await db.query("select public.onboard_business($1,$2,$3::jsonb) as id", [
      user,
      name,
      JSON.stringify(state),
    ])
  ).rows[0].id;
}
const ta = await onboard(a, "A"),
  tb = await onboard(b, "B");
await db.query("select public.add_business_user($1,$2,$3,$4,$5)", [
  ta,
  a,
  sales,
  "Sales",
  "sales",
]);
async function asUser(id, fn) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    await fn();
  } finally {
    await db.exec("reset role");
  }
}
await asUser(a, async () => {
  assert.equal((await db.query("select * from tenant_states")).rows.length, 1);
  assert.equal(
    (await db.query("select * from tenant_states where tenant_id=$1", [tb]))
      .rows.length,
    0,
  );
  await assert.rejects(
    db.query("update tenant_states set revision=100 where tenant_id=$1", [tb]),
  );
  await assert.rejects(
    db.query("select commit_state($1,$2,0,$3::jsonb,$4)", [
      tb,
      a,
      JSON.stringify(state),
      "stock.adjust",
    ]),
  );
});
await asUser(sales, async () => {
  assert.equal((await db.query("select * from tenant_states")).rows.length, 0);
  assert.equal((await db.query("select * from memberships")).rows.length, 1);
  await assert.rejects(
    db.query("select commit_state($1,$2,0,$3::jsonb,$4)", [
      ta,
      sales,
      JSON.stringify(state),
      "quote.approve",
    ]),
  );
});
await assert.rejects(
  db.query("select commit_state($1,$2,0,$3::jsonb,$4)", [
    tb,
    a,
    JSON.stringify(state),
    "stock.adjust",
  ]),
);
await assert.rejects(
  db.query("select commit_state($1,$2,1,$3::jsonb,$4)", [
    ta,
    sales,
    JSON.stringify(state),
    "quote.approve",
  ]),
);
const first = (
  await db.query("select revision from tenant_states where tenant_id=$1", [ta])
).rows[0].revision;
const races = await Promise.all([
  db.query("select commit_state($1,$2,$3,$4::jsonb,$5) as ok", [
    ta,
    a,
    first,
    JSON.stringify(state),
    "stock.adjust",
  ]),
  db.query("select commit_state($1,$2,$3,$4::jsonb,$5) as ok", [
    ta,
    a,
    first,
    JSON.stringify(state),
    "stock.adjust",
  ]),
]);
assert.deepEqual(races.map((x) => x.rows[0].ok).sort(), [false, true]);
async function reserve(hash, reserve = 400) {
  return (
    await db.query("select reserve_ai($1,$2,$3,$4,$5,$6,$7) as ticket", [
      ta,
      a,
      hash,
      reserve,
      2000,
      20,
      100,
    ])
  ).rows[0].ticket;
}
const ticket = await reserve("hash-a");
assert.ok(ticket.id);
assert.equal((await reserve("hash-a")).pending, true);
await db.query("select finish_ai($1,$2::jsonb,$3,$4,$5,$6)", [
  ticket.id,
  JSON.stringify({ items: [] }),
  1,
  1,
  100,
  "complete",
]);
assert.ok((await reserve("hash-a")).cached);
await reserve("hash-b");
await assert.rejects(reserve("hash-c"));
await asUser(b, async () =>
  assert.equal(
    (await db.query("select id from ai_usage where tenant_id=$1", [ta])).rows
      .length,
    0,
  ),
);
await assert.rejects(
  db.query("select * from report_ai_usage($1,$2,$3,$4)", [
    ta,
    b,
    "2026-01-01",
    "2026-12-31",
  ]),
);
await assert.rejects(
  db.query("select * from report_ai_usage($1,$2,$3,$4)", [
    ta,
    sales,
    "2026-01-01",
    "2026-12-31",
  ]),
);
await assert.rejects(
  db.query("select commit_state($1,$2,1,$3::jsonb,$4)", [
    ta,
    sales,
    JSON.stringify(state),
    "report.expense",
  ]),
);
const reportDays = (
  await db.query("select * from report_ai_usage($1,$2,$3,$4)", [
    ta,
    a,
    "2026-01-01",
    "2026-12-31",
  ])
).rows;
assert.equal(
  reportDays.reduce((n, d) => n + Number(d.requests), 0),
  2,
);
assert.equal(
  reportDays.reduce((n, d) => n + Number(d.estimated_micros), 0),
  500,
);
console.log(
  "PASS: admin-only financial writes and AI report aggregation reject sales/cross-tenant actors.",
);
console.log(
  "PASS: tenant A cannot read/write tenant B; sales cannot read private state or approve via RPC; membership spoofing rejected; one CAS winner; durable AI dedupe and allowance exhaustion.",
);
await assert.rejects(
  db.query("select commit_state($1,$2,1,$3::jsonb,$4)", [
    ta,
    sales,
    JSON.stringify(state),
    "invoice.approve",
  ]),
);
await assert.rejects(
  db.query("select reserve_invoice_email($1,$2,$3,$4)", [
    ta,
    b,
    "invoice-x",
    1,
  ]),
);
await assert.rejects(
  db.query("select reserve_invoice_email($1,$2,$3,$4)", [
    ta,
    sales,
    "invoice-x",
    1,
  ]),
);
await db.query(
  "update tenant_states set state=jsonb_set(state,'{invoices}',$2::jsonb) where tenant_id=$1",
  [
    ta,
    JSON.stringify([
      {
        id: "invoice-x",
        revision: 1,
        approvedBy: a,
        status: "Approved",
        attempts: 0,
        firstAttemptAt: "",
        lastAttemptAt: "",
      },
    ]),
  ],
);
assert.equal(
  (
    await db.query("select reserve_invoice_email($1,$2,$3,$4) ok", [
      ta,
      a,
      "invoice-x",
      1,
    ])
  ).rows[0].ok,
  true,
);
assert.equal(
  (
    await db.query("select reserve_invoice_email($1,$2,$3,$4) ok", [
      ta,
      a,
      "invoice-x",
      1,
    ])
  ).rows[0].ok,
  true,
);
assert.equal(
  (await db.query("select * from invoice_email_usage where tenant_id=$1", [ta]))
    .rows.length,
  1,
);
assert.equal(
  (await db.query("select * from invoice_delivery_tenants()")).rows.length,
  1,
);
await asUser(b, async () => {
  await assert.rejects(db.query("select * from invoice_email_usage"));
  await assert.rejects(db.query("select * from invoice_delivery_tenants()"));
});
await db.query(
  "insert into invoice_email_usage(tenant_id,invoice_id,revision) select $1,'quota-'||g,1 from generate_series(1,99) g",
  [ta],
);
await db.query(
  "update tenant_states set state=jsonb_set(state,'{invoices}',$2::jsonb) where tenant_id=$1",
  [
    ta,
    JSON.stringify([
      { id: "invoice-y", revision: 1, approvedBy: a, status: "Approved" },
    ]),
  ],
);
await assert.rejects(
  db.query("select reserve_invoice_email($1,$2,$3,$4)", [
    ta,
    a,
    "invoice-y",
    1,
  ]),
);
console.log(
  "PASS: invoice approval permissions, server-only delivery selection, tenant-bound invoice reservations, idempotency and shared daily email cap.",
);
await db.close();
