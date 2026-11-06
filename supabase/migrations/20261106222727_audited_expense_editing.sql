-- Expense corrections retain an append-only history and optimistic row revision.
alter table public.finance_entries add column updated_at timestamptz not null default now();
create table private.finance_entry_edits (
 id bigint generated always as identity primary key,
 expense_id uuid not null references public.finance_entries(id),
 actor_id uuid,
 changed_at timestamptz not null default clock_timestamp(),
 old_values jsonb not null,
 new_values jsonb not null
);
alter table private.finance_entry_edits enable row level security;
revoke all on private.finance_entry_edits from public,anon,authenticated;
revoke all on sequence private.finance_entry_edits_id_seq from public,anon,authenticated;
create index finance_entry_edits_expense_idx on private.finance_entry_edits(expense_id,id desc);
create index finance_entry_edits_actor_idx on private.finance_entry_edits(actor_id);
create function private.prevent_expense_audit_changes() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'AUDIT_IMMUTABLE'; end $$;
revoke all on function private.prevent_expense_audit_changes() from public,anon,authenticated;
create trigger immutable_expense_audit before update or delete on private.finance_entry_edits for each row execute function private.prevent_expense_audit_changes();
create trigger immutable_expense_audit_truncate before truncate on private.finance_entry_edits for each statement execute function private.prevent_expense_audit_changes();

create function private.audit_finance_entry_change() returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb;
begin
 if (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then new.updated_at:=old.updated_at; return new; end if;
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 old_data:=jsonb_build_object('entry_date',old.entry_date,'category',old.category,'amount',old.amount,'note',old.note,'voided_at',old.voided_at,'voided_by',old.voided_by);
 new_data:=jsonb_build_object('entry_date',new.entry_date,'category',new.category,'amount',new.amount,'note',new.note,'voided_at',new.voided_at,'voided_by',new.voided_by);
 if old_data is distinct from new_data then
  insert into private.finance_entry_edits(expense_id,actor_id,old_values,new_values) values(old.id,auth.uid(),old_data,new_data);
 end if;
 return new;
end $$;
revoke all on function private.audit_finance_entry_change() from public,anon,authenticated;
create trigger audit_finance_entry_change before update on public.finance_entries for each row execute function private.audit_finance_entry_change();

create function public.edit_finance_entry(p_id uuid,p_date date,p_category text,p_amount numeric,p_note text,p_expected_updated_at timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare entry public.finance_entries; result timestamptz; normalized_note text:=coalesce(trim(p_note),'');
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_date is null or not isfinite(p_date) or p_date>(now() at time zone 'Africa/Cairo')::date
    or p_category is null or p_category not in ('inventory','marketing','shipping','packaging','overhead','other')
    or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>9999999999.99
    or length(coalesce(p_note,''))>1000 or p_expected_updated_at is null or not isfinite(p_expected_updated_at) then raise exception 'INVALID_ENTRY'; end if;
 select * into entry from public.finance_entries where id=p_id for update;
 if not found then raise exception 'ENTRY_NOT_AVAILABLE'; end if;
 -- A retry after a lost response is successful without adding another audit entry.
 if entry.entry_date=p_date and entry.category=p_category and entry.amount=p_amount and entry.note=normalized_note then return entry.updated_at; end if;
 if entry.updated_at is distinct from p_expected_updated_at then raise exception 'EXPENSE_CHANGED'; end if;
 update public.finance_entries set entry_date=p_date,category=p_category,amount=p_amount,note=normalized_note where id=p_id returning updated_at into result;
 return result;
end $$;
revoke all on function public.edit_finance_entry(uuid,date,text,numeric,text,timestamptz) from public,anon,authenticated;
grant execute on function public.edit_finance_entry(uuid,date,text,numeric,text,timestamptz) to authenticated;

create function public.finance_entry_history(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'changed_at',changed_at,'actor_id',actor_id,'old_values',old_values,'new_values',new_values) order by id desc),'[]'::jsonb) into result from private.finance_entry_edits where expense_id=p_id;
 return result;
end $$;
revoke all on function public.finance_entry_history(uuid) from public,anon,authenticated;
grant execute on function public.finance_entry_history(uuid) to authenticated;

-- Admin expense management uses one filtered snapshot for rows, counts and totals.
-- No write/payment semantics change; voided entries remain visible for audit.
create or replace function public.expense_page(
 p_from date default null,p_to date default null,p_category text default null,
 p_search text default '',p_status text default 'active',p_offset integer default 0,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; search_text text := trim(coalesce(p_search,''));
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to))
    or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_DATE_RANGE'; end if;
 if p_category is not null and p_category not in ('inventory','marketing','shipping','packaging','overhead','other') then raise exception 'INVALID_CATEGORY'; end if;
 if p_status is null or p_status not in ('active','voided','all') then raise exception 'INVALID_STATUS'; end if;
 if length(search_text)>200 or p_offset is null or p_offset<0 or p_offset>1000000
    or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'INVALID_PAGE'; end if;
 with matched as materialized (
  select e.id,e.entry_date,e.category,e.amount,e.note,e.voided_at,e.created_at,e.updated_at
  from public.finance_entries e
  where (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
   and (p_category is null or e.category=p_category)
   and (search_text='' or strpos(lower(e.note),lower(search_text))>0)
   and (p_status='all' or (p_status='active' and e.voided_at is null) or (p_status='voided' and e.voided_at is not null))
 ), page_rows as (
  select * from matched order by entry_date desc,created_at desc,id desc offset p_offset limit p_limit
 ), totals as (
  select count(*) as total_count,count(*) filter(where voided_at is null) as active_count,
   count(*) filter(where voided_at is not null) as voided_count,
   coalesce(sum(amount) filter(where voided_at is null),0) as active_total,
   coalesce(sum(amount) filter(where voided_at is not null),0) as voided_total from matched
 )
 select jsonb_build_object(
  'entries',(select coalesce(jsonb_agg(to_jsonb(p) order by p.entry_date desc,p.created_at desc,p.id desc),'[]'::jsonb) from page_rows p),
  'total_count',t.total_count,'active_count',t.active_count,'voided_count',t.voided_count,
  'active_total',t.active_total,'voided_total',t.voided_total,
  'category_totals',(select coalesce(jsonb_agg(to_jsonb(c) order by c.category),'[]'::jsonb) from (select category,sum(amount) as amount,count(*) as count from matched where voided_at is null group by category) c),
  'offset',p_offset,'limit',p_limit,'has_more',p_offset+p_limit<t.total_count
 ) into result from totals t;
 return result;
end $$;
revoke all on function public.expense_page(date,date,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.expense_page(date,date,text,text,text,integer,integer) to authenticated;
