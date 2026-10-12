-- Shared Postgres database. Private aggregates are only read/mutated through authenticated Worker.
create table public.businesses(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.memberships(user_id uuid primary key references auth.users(id) on delete cascade,tenant_id uuid not null references public.businesses(id) on delete cascade,role text not null check(role in ('admin','sales')),name text not null default 'Business user');
create table public.tenant_states(tenant_id uuid primary key references public.businesses(id) on delete cascade,state jsonb not null,revision bigint not null default 0,updated_at timestamptz not null default now(),check(state->>'version'='1'));
create table public.security_audit(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.businesses(id) on delete cascade,user_id uuid not null,action text not null,detail text not null default '',created_at timestamptz not null default now());
create table public.ai_usage(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.businesses(id) on delete cascade,user_id uuid not null,hash text not null,status text not null check(status in ('pending','complete','failed')),reserved_micros bigint not null check(reserved_micros>=0),estimated_micros bigint not null default 0,input_tokens bigint not null default 0,output_tokens bigint not null default 0,result jsonb,created_at timestamptz not null default now());
create index ai_tenant_time on public.ai_usage(tenant_id,created_at);
create index ai_hash on public.ai_usage(tenant_id,hash,created_at);
create table public.app_budget(id integer primary key check(id=1));insert into public.app_budget values(1);
create function public.member_role(t uuid) returns text language sql stable security definer set search_path='' as $$select role from public.memberships where tenant_id=t and user_id=auth.uid()$$;
revoke all on function public.member_role(uuid) from public;grant execute on function public.member_role(uuid) to authenticated;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.tenant_states enable row level security;
alter table public.security_audit enable row level security;
alter table public.ai_usage enable row level security;
alter table public.app_budget enable row level security;
create policy business_read on public.businesses for select to authenticated using(public.member_role(id) is not null);
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid() or public.member_role(tenant_id)='admin');
-- No direct browser writes. Sales cannot read private cost prices even in raw REST requests.
create policy admin_private_read on public.tenant_states for select to authenticated using(public.member_role(tenant_id)='admin');
create policy admin_audit_read on public.security_audit for select to authenticated using(public.member_role(tenant_id)='admin');
create policy usage_read on public.ai_usage for select to authenticated using(public.member_role(tenant_id)='admin' or (public.member_role(tenant_id) is not null and user_id=auth.uid()));
grant select on public.businesses,public.memberships,public.tenant_states,public.security_audit to authenticated;
-- AI extracted text stays private to Worker; do not expose cached result column through REST.
grant select(id,tenant_id,user_id,status,reserved_micros,estimated_micros,input_tokens,output_tokens,created_at) on public.ai_usage to authenticated;
grant all on all tables in schema public to service_role;
create function public.onboard_business(p_user uuid,p_name text,p_state jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare t uuid;begin
if exists(select 1 from public.memberships where user_id=p_user) then raise exception 'already onboarded';end if;
insert into public.businesses(name) values(p_name) returning id into t;
insert into public.memberships(user_id,tenant_id,role,name) values(p_user,t,'admin',p_name||' admin');
insert into public.tenant_states(tenant_id,state) values(t,p_state);
insert into public.security_audit(tenant_id,user_id,action) values(t,p_user,'business.created');return t;end$$;
create function public.commit_state(p_tenant uuid,p_user uuid,p_revision bigint,p_state jsonb,p_action text) returns boolean language plpgsql security definer set search_path='' as $$declare r text;begin
select role into r from public.memberships where tenant_id=p_tenant and user_id=p_user;
if r is null then raise exception 'membership required';end if;
if p_action in ('settings.save','stock.adjust','product.save','import','quote.approve') and r<>'admin' then raise exception 'admin required';end if;
update public.tenant_states set state=p_state,revision=revision+1,updated_at=now() where tenant_id=p_tenant and revision=p_revision;
if not found then return false;end if;
insert into public.security_audit(tenant_id,user_id,action) values(p_tenant,p_user,p_action);return true;end$$;
create function public.add_business_user(p_tenant uuid,p_actor uuid,p_user uuid,p_name text,p_role text) returns void language plpgsql security definer set search_path='' as $$declare s jsonb;n integer;begin
if not exists(select 1 from public.memberships where user_id=p_actor and tenant_id=p_tenant and role='admin') then raise exception 'admin required';end if;
select state into s from public.tenant_states where tenant_id=p_tenant for update;
select count(*) into n from public.memberships where tenant_id=p_tenant;
if n>=(s->'settings'->>'userLimit')::integer then raise exception 'user limit';end if;
insert into public.memberships(user_id,tenant_id,role,name) values(p_user,p_tenant,p_role,p_name);
update public.tenant_states set state=jsonb_set(state,'{users}',(state->'users')||jsonb_build_array(jsonb_build_object('id',p_user,'name',p_name,'role',p_role))),revision=revision+1 where tenant_id=p_tenant;
insert into public.security_audit(tenant_id,user_id,action,detail) values(p_tenant,p_actor,'user.created',p_user::text);end$$;
create function public.reserve_ai(p_tenant uuid,p_user uuid,p_hash text,p_reserve bigint,p_app_ceiling bigint,p_user_daily integer,p_tenant_daily integer) returns jsonb language plpgsql security definer set search_path='' as $$declare s jsonb;ticket public.ai_usage;tenant_sum bigint;app_sum bigint;tenant_n integer;user_n integer;begin
-- Serialize global + tenant reservations before checking limits, including in-flight usage.
perform 1 from public.app_budget where id=1 for update;
select state into s from public.tenant_states where tenant_id=p_tenant for update;
if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_user) then raise exception 'membership required';end if;
if s->'settings'->>'subscription' in ('Past due','Cancelled') then raise exception 'AI paused';end if;
update public.ai_usage set result=null where result is not null and created_at<now()-interval '24 hours';
select * into ticket from public.ai_usage where tenant_id=p_tenant and hash=p_hash and created_at>now()-interval '24 hours' and status in ('complete','pending') order by created_at desc limit 1;
if found then if ticket.status='complete' and ticket.result is not null then return jsonb_build_object('cached',ticket.result);else return jsonb_build_object('pending',true);end if;end if;
select coalesce(sum(case when status='pending' then reserved_micros else estimated_micros end),0),count(*) into tenant_sum,tenant_n from public.ai_usage where tenant_id=p_tenant and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
select coalesce(sum(case when status='pending' then reserved_micros else estimated_micros end),0) into app_sum from public.ai_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
select count(*) into user_n from public.ai_usage where tenant_id=p_tenant and user_id=p_user and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
if tenant_n>=(s->'settings'->>'allowance')::integer or user_n>=p_user_daily or tenant_sum+p_reserve>(s->'settings'->>'spendCeilingMicros')::bigint or app_sum+p_reserve>p_app_ceiling then raise exception 'AI limit';end if;
select count(*) into tenant_n from public.ai_usage where tenant_id=p_tenant and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
if tenant_n>=p_tenant_daily then raise exception 'daily tenant limit';end if;
insert into public.ai_usage(tenant_id,user_id,hash,status,reserved_micros) values(p_tenant,p_user,p_hash,'pending',p_reserve) returning * into ticket;
return jsonb_build_object('id',ticket.id);end$$;
create function public.finish_ai(p_id uuid,p_result jsonb,p_input bigint,p_output bigint,p_cost bigint,p_status text) returns void language plpgsql security definer set search_path='' as $$begin
update public.ai_usage set result=p_result,input_tokens=p_input,output_tokens=p_output,estimated_micros=p_cost,status=p_status where id=p_id and status='pending';end$$;
-- Every privileged RPC is callable only using the Worker service credential.
revoke all on function public.onboard_business(uuid,text,jsonb),public.commit_state(uuid,uuid,bigint,jsonb,text),public.add_business_user(uuid,uuid,uuid,text,text),public.reserve_ai(uuid,uuid,text,bigint,bigint,integer,integer),public.finish_ai(uuid,jsonb,bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.onboard_business(uuid,text,jsonb),public.commit_state(uuid,uuid,bigint,jsonb,text),public.add_business_user(uuid,uuid,uuid,text,text),public.reserve_ai(uuid,uuid,text,bigint,bigint,integer,integer),public.finish_ai(uuid,jsonb,bigint,bigint,bigint,text) to service_role;
create function public.restore_state(p_tenant uuid,p_revision bigint,p_state jsonb) returns boolean language plpgsql security definer set search_path='' as $$begin
update public.tenant_states set state=jsonb_set(p_state,'{users}',state->'users'),revision=revision+1,updated_at=now() where tenant_id=p_tenant and revision=p_revision;
if not found then return false;end if;
insert into public.security_audit(tenant_id,user_id,action) select p_tenant,user_id,'operator.restore' from public.memberships where tenant_id=p_tenant and role='admin' limit 1;return true;end$$;
revoke all on function public.restore_state(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.restore_state(uuid,bigint,jsonb) to service_role;
