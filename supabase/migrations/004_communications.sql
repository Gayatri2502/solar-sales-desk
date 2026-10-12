-- Communication policy is admin-only. Provider reservations/events are Worker controlled.
create or replace function public.commit_state(p_tenant uuid,p_user uuid,p_revision bigint,p_state jsonb,p_action text) returns boolean language plpgsql security definer set search_path='' as $$declare r text;begin
select role into r from public.memberships where tenant_id=p_tenant and user_id=p_user;
if r is null then raise exception 'membership required';end if;
if (p_action in ('settings.save','stock.adjust','product.save','import','quote.approve','comms.policy','invoice.approve','invoice.refreshBusiness','invoice.return','invoice.claim','invoice.complete','invoice.fail','invoice.demoSend') or p_action like 'report.%') and r<>'admin' then raise exception 'admin required';end if;
update public.tenant_states set state=p_state,revision=revision+1,updated_at=now() where tenant_id=p_tenant and revision=p_revision;
if not found then return false;end if;
insert into public.security_audit(tenant_id,user_id,action) values(p_tenant,p_user,p_action);return true;end$$;
