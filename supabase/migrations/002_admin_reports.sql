-- Reporting stays inside the existing shared, isolated tenant database.
create or replace function public.commit_state(p_tenant uuid,p_user uuid,p_revision bigint,p_state jsonb,p_action text) returns boolean language plpgsql security definer set search_path='' as $$declare r text;begin
select role into r from public.memberships where tenant_id=p_tenant and user_id=p_user;
if r is null then raise exception 'membership required';end if;
if (p_action in ('settings.save','stock.adjust','product.save','import','quote.approve') or p_action like 'report.%') and r<>'admin' then raise exception 'admin required';end if;
update public.tenant_states set state=p_state,revision=revision+1,updated_at=now() where tenant_id=p_tenant and revision=p_revision;
if not found then return false;end if;
insert into public.security_audit(tenant_id,user_id,action) values(p_tenant,p_user,p_action);return true;end$$;

create function public.report_ai_usage(p_tenant uuid,p_actor uuid,p_from date,p_to date)
returns table(day date,requests bigint,input_tokens bigint,output_tokens bigint,estimated_micros numeric,failed bigint)
language plpgsql security definer set search_path='' as $$declare zone text;begin
if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_actor and role='admin') then raise exception 'admin required';end if;
if p_to<p_from or p_to-p_from>370 then raise exception 'invalid report range';end if;
select state->'settings'->>'timezone' into zone from public.tenant_states where tenant_id=p_tenant;
return query select (u.created_at at time zone zone)::date,count(*),coalesce(sum(u.input_tokens),0)::bigint,coalesce(sum(u.output_tokens),0)::bigint,
coalesce(sum(case when u.status='pending' then u.reserved_micros else u.estimated_micros end),0),count(*) filter(where u.status='failed')
from public.ai_usage u where u.tenant_id=p_tenant and u.created_at >= (p_from::timestamp at time zone zone) and u.created_at < ((p_to+1)::timestamp at time zone zone)
group by (u.created_at at time zone zone)::date order by 1;
end$$;
revoke all on function public.report_ai_usage(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.report_ai_usage(uuid,uuid,date,date) to service_role;
