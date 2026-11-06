-- Admin expense management uses one filtered snapshot for rows, counts and totals.
-- No write/payment semantics change; voided entries remain visible for audit.
create function public.expense_page(
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
  select e.id,e.entry_date,e.category,e.amount,e.note,e.voided_at,e.created_at
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
  'offset',p_offset,'limit',p_limit,'has_more',p_offset+p_limit<t.total_count
 ) into result from totals t;
 return result;
end $$;
revoke all on function public.expense_page(date,date,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.expense_page(date,date,text,text,text,integer,integer) to authenticated;
