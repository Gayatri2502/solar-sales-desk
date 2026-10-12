-- Server-only delivery ledger, sharing the existing database. Limits are conservative
-- reservations (including failures), across the application, UTC calendar periods.
create table public.invoice_email_usage (
 tenant_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id text not null, revision integer not null, created_at timestamptz not null default now(),
 primary key(tenant_id,invoice_id,revision)
);
alter table public.invoice_email_usage enable row level security;
revoke all on public.invoice_email_usage from anon,authenticated;
grant all on public.invoice_email_usage to service_role;
create function public.reserve_invoice_email(p_tenant uuid,p_actor uuid,p_invoice text,p_revision integer) returns boolean language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_actor and role='admin') then raise exception 'admin required';end if;
if not exists(select 1 from public.tenant_states t,jsonb_array_elements(coalesce(t.state->'invoices','[]'::jsonb)) i where t.tenant_id=p_tenant and i->>'id'=p_invoice and (i->>'revision')::int=p_revision and i->>'approvedBy'=p_actor::text and i->>'status' in ('Approved','Failed','Sending')) then raise exception 'approved invoice required';end if;
perform pg_advisory_xact_lock(73003001);
if exists(select 1 from public.invoice_email_usage where tenant_id=p_tenant and invoice_id=p_invoice and revision=p_revision) then return true;end if;
if (select count(*) from public.invoice_email_usage where created_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')) >=100 or
(select count(*) from public.invoice_email_usage where created_at >= (date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')) >=3000 then raise exception 'email allowance reached';end if;
insert into public.invoice_email_usage(tenant_id,invoice_id,revision) values(p_tenant,p_invoice,p_revision);return true;end$$;
revoke all on function public.reserve_invoice_email(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_invoice_email(uuid,uuid,text,integer) to service_role;
create or replace function public.commit_state(p_tenant uuid,p_user uuid,p_revision bigint,p_state jsonb,p_action text) returns boolean language plpgsql security definer set search_path='' as $$declare r text;begin
select role into r from public.memberships where tenant_id=p_tenant and user_id=p_user;
if r is null then raise exception 'membership required';end if;
if (p_action in ('settings.save','stock.adjust','product.save','import','quote.approve','invoice.approve','invoice.refreshBusiness','invoice.return','invoice.claim','invoice.complete','invoice.fail','invoice.demoSend') or p_action like 'report.%') and r<>'admin' then raise exception 'admin required';end if;
update public.tenant_states set state=p_state,revision=revision+1,updated_at=now() where tenant_id=p_tenant and revision=p_revision;
if not found then return false;end if;
insert into public.security_audit(tenant_id,user_id,action) values(p_tenant,p_user,p_action);return true;end$$;
create function public.invoice_delivery_tenants() returns table(tenant_id uuid)
language sql security definer set search_path='' as $$
select t.tenant_id from public.tenant_states t where exists(
 select 1 from jsonb_array_elements(coalesce(t.state->'invoices','[]'::jsonb)) i
 where i->>'status' in ('Approved','Failed','Sending') and coalesce((i->>'attempts')::int,0)<3
 and (coalesce(i->>'firstAttemptAt','')='' or (i->>'firstAttemptAt')::timestamptz>now()-interval '23 hours')
 and (i->>'status'<>'Sending' or (i->>'lastAttemptAt')::timestamptz<now()-interval '2 minutes')
 and exists(select 1 from public.memberships m where m.tenant_id=t.tenant_id and m.user_id::text=i->>'approvedBy' and m.role='admin')
) order by t.updated_at limit 10;
$$;
revoke all on function public.invoice_delivery_tenants() from public,anon,authenticated;
grant execute on function public.invoice_delivery_tenants() to service_role;
