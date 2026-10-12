import { type SupabaseClient } from "@supabase/supabase-js";
import { type State, type Command } from "../../src/domain";
import { FirebaseStore, StoreError, type Member } from "./store";
export class FirebaseBridge {
  constructor(readonly store: FirebaseStore) {}
  from(table: string) {
    const filters: Record<string, string> = {};
    const query = {
      select: (_fields: string) => query,
      eq: (field: string, value: string) => {
        filters[field] = value;
        return query;
      },
      limit: (_n: number) => query,
      single: async () => {
        try {
          const tenant = filters.tenant_id;
          if (!tenant) throw Error("Business binding required.");
          const snapshot = await this.store.get<State>("businesses/" + tenant);
          if (!snapshot) throw Error("Business unavailable.");
          if (table === "tenant_states")
            return { data: { state: snapshot.value }, error: null };
          if (table === "memberships") {
            for (const u of snapshot.value.users) {
              if (filters.role && u.role !== filters.role) continue;
              if (filters.user_id && u.id !== filters.user_id) continue;
              const m = await this.store.member(u.id);
              if (
                m.tenant === tenant &&
                (!filters.role || m.role === filters.role)
              )
                return { data: { user_id: m.id }, error: null };
            }
            throw Error("Business administrator unavailable.");
          }
          throw Error("Unsupported integration query.");
        } catch {
          return {
            data: null,
            error: { message: "Business integration record unavailable." },
          };
        }
      },
    };
    return query;
  }
  async rpc(name: string, p: Record<string, any>) {
    if (name !== "reserve_invoice_email")
      return {
        error: { message: "Unsupported integration operation." },
        data: null,
      };
    try {
      const m = await this.store.member(p.p_actor);
      if (m.role !== "admin" || m.tenant !== p.p_tenant)
        throw Error("Admin required.");
      for (let attempt = 0; attempt < 4; attempt++) {
        const s = await this.store.get<State>("businesses/" + m.tenant);
        if (!s) throw Error("Business unavailable.");
        const i = s.value.invoices?.find(
          (i) => i.id === p.p_invoice && i.revision === p.p_revision,
        );
        if (
          !i ||
          !i.approvedBy ||
          !["Approved", "Sending", "Failed"].includes(i.status)
        )
          throw Error("Invoice approval required.");
        const day = new Date().toISOString().slice(0, 10),
          month = day.slice(0, 7),
          key = "invoice-" + m.tenant + "-" + i.id + "-" + i.revision;
        const old = await this.store.get<{
            month: string;
            days: Record<string, number>;
            keys: string[];
          }>("system/email-quota"),
          v =
            old?.value.month === month
              ? structuredClone(old.value)
              : { month, days: {}, keys: [] };
        if (v.keys.includes(key)) return { data: true, error: null };
        if (v.keys.length >= 3000 || (v.days[day] || 0) >= 100)
          throw Error("Email allowance reached.");
        v.keys.push(key);
        v.days[day] = (v.days[day] || 0) + 1;
        try {
          await this.store.call(this.store.root + "/documents:commit", {
            writes: [
              {
                verify: this.store.name("businesses/" + m.tenant),
                currentDocument: { updateTime: s.stamp },
              },
              this.store.write("system/email-quota", v, old?.stamp),
            ],
          });
          return { data: true, error: null };
        } catch (e) {
          if (!(e instanceof StoreError) || ![409, 412].includes(e.status))
            throw e;
        }
      }
      throw Error("Email reservation conflict.");
    } catch {
      return {
        data: null,
        error: { message: "Invoice allowance or authorization unavailable." },
      };
    }
  }
  asDatabase() {
    return this as unknown as SupabaseClient;
  }
}
export async function firebaseMutate(
  db: SupabaseClient,
  ctx: Member,
  cmd: Command,
) {
  const bridge = db as unknown as FirebaseBridge;
  return bridge.store.mutateTrusted(ctx.id, ctx.tenant, cmd);
}
