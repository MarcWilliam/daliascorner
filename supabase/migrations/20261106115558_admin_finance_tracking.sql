-- Paid-order management estimates and cash tracking. This is not an accrual ledger.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.finance_tracking_start (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null default now(),
  untracked_refunded_orders integer not null
);
insert into private.finance_tracking_start(untracked_refunded_orders)
 select count(*) from public.orders where payment_status='refunded';

create table public.product_costs (
  product_id text primary key references public.inventory(product_id),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
revoke all on public.product_costs from anon,authenticated;
grant select on public.product_costs to authenticated;
grant all on public.product_costs to service_role;
create policy admin_product_costs on public.product_costs for select to authenticated using ((select public.is_admin()));

-- Private snapshots are separate from customer-readable order_items.
create table public.order_item_costs (
  item_id bigint primary key references public.order_items(id),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);
alter table public.order_item_costs enable row level security;
revoke all on public.order_item_costs from anon,authenticated;
grant select on public.order_item_costs to authenticated;
grant all on public.order_item_costs to service_role;
create policy admin_order_costs on public.order_item_costs for select to authenticated using ((select public.is_admin()));
create index order_cost_actor_idx on public.order_item_costs(recorded_by);

create function private.snapshot_item_cost() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.order_item_costs(item_id,unit_cost)
 values(new.id,(select unit_cost from public.product_costs where product_id=new.product_id));
 return new;
end $$;
revoke all on function private.snapshot_item_cost() from public,anon,authenticated;
create trigger snapshot_item_cost after insert on public.order_items for each row execute function private.snapshot_item_cost();
insert into public.order_item_costs(item_id,unit_cost) select id,null from public.order_items;

create table public.finance_payment_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  event_type text not null check (event_type in ('payment','refund','correction','opening_paid')),
  amount numeric(12,2) not null,
  item_amount numeric(12,2) not null,
  delivery_amount numeric(12,2) not null,
  cost_factor integer not null default 0 check(cost_factor between -1 and 1),
  occurred_at timestamptz,
  recorded_at timestamptz not null default now(),
  actor uuid references auth.users(id)
);
alter table public.finance_payment_events enable row level security;
revoke all on public.finance_payment_events from anon,authenticated;
grant select on public.finance_payment_events to authenticated;
grant all on public.finance_payment_events to service_role;
grant usage,select on sequence public.finance_payment_events_id_seq to service_role;
create policy admin_finance_payments on public.finance_payment_events for select to authenticated using ((select public.is_admin()));
create index finance_payments_order_idx on public.finance_payment_events(order_id);
create index finance_payments_date_idx on public.finance_payment_events(occurred_at);
create index finance_payments_actor_idx on public.finance_payment_events(actor);
-- Existing paid flags are a balance, not evidence of an exact payment date.
insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at)
 select id,'opening_paid',subtotal+delivery_fee,subtotal,delivery_fee,1,null from public.orders where payment_status='paid';

create function private.record_order_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare factor integer := 0; cost_balance integer;
begin
 if new.payment_status=old.payment_status then return new; end if;
 if new.payment_status='refunded' and old.payment_status<>'paid' then raise exception 'REFUND_REQUIRES_PAID_ORDER'; end if;
 select coalesce(sum(cost_factor),0) into cost_balance from public.finance_payment_events where order_id=new.id;
 if new.payment_status='paid' then
   if cost_balance=0 then factor:=1; end if;
   insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor)
   values(new.id,'payment',new.subtotal+new.delivery_fee,new.subtotal,new.delivery_fee,factor,now(),auth.uid());
 elsif old.payment_status='paid' and new.payment_status in ('unpaid','refunded') then
   -- Unpaid corrects a mistaken paid flag. A refund does not assume goods recovered.
   if new.payment_status='unpaid' and cost_balance>0 then factor:=-1; end if;
   insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor)
   values(new.id,case when new.payment_status='refunded' then 'refund' else 'correction' end,-(new.subtotal+new.delivery_fee),-new.subtotal,-new.delivery_fee,factor,now(),auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.record_order_payment() from public,anon,authenticated;
create trigger record_order_payment after update of payment_status on public.orders for each row execute function private.record_order_payment();

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  category text not null check(category in ('inventory','marketing','shipping','packaging','overhead','other')),
  amount numeric(12,2) not null check(amount>0),
  note text not null default '' check(length(note)<=1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id)
);
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon,authenticated;
grant select on public.finance_entries to authenticated;
grant all on public.finance_entries to service_role;
create policy admin_finance_entries on public.finance_entries for select to authenticated using ((select public.is_admin()));
create index finance_entries_date_idx on public.finance_entries(entry_date) where voided_at is null;
create index finance_entries_creator_idx on public.finance_entries(created_by);
create index finance_entries_void_actor_idx on public.finance_entries(voided_by);

create function public.set_product_unit_cost(p_product text,p_cost numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_cost is not null and (p_cost<0 or p_cost<>round(p_cost,2) or p_cost>9999999999.99) then raise exception 'INVALID_COST'; end if;
 insert into public.product_costs(product_id,unit_cost) values(p_product,p_cost)
 on conflict(product_id) do update set unit_cost=excluded.unit_cost,updated_at=now();
end $$;
create function public.set_order_item_cost(p_item bigint,p_cost numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_cost is null or p_cost<0 or p_cost<>round(p_cost,2) or p_cost>9999999999.99 then raise exception 'INVALID_COST'; end if;
 update public.order_item_costs set unit_cost=p_cost,recorded_by=auth.uid(),recorded_at=now() where item_id=p_item and unit_cost is null;
 if not found then raise exception 'COST_ALREADY_RECORDED'; end if;
end $$;
create function public.add_finance_entry(p_date date,p_category text,p_amount numeric,p_note text default '',p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_date is null or p_date>(now() at time zone 'Africa/Cairo')::date or p_category is null or p_category not in ('inventory','marketing','shipping','packaging','overhead','other') or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>9999999999.99 or length(coalesce(p_note,''))>1000 then raise exception 'INVALID_ENTRY'; end if;
 insert into public.finance_entries(id,entry_date,category,amount,note,created_by) values(p_id,p_date,p_category,p_amount,coalesce(trim(p_note),''),auth.uid()) on conflict(id) do nothing returning id into result;
 if result is null then
   select id into result from public.finance_entries where id=p_id and entry_date=p_date and category=p_category and amount=p_amount and note=coalesce(trim(p_note),'') and created_by=auth.uid();
   if result is null then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 end if;
 return result;
end $$;
create function public.void_finance_entry(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 update public.finance_entries set voided_at=now(),voided_by=auth.uid() where id=p_id and voided_at is null;
 if not found then raise exception 'ENTRY_NOT_AVAILABLE'; end if;
end $$;
revoke all on function public.set_product_unit_cost(text,numeric),public.set_order_item_cost(bigint,numeric),public.add_finance_entry(date,text,numeric,text,uuid),public.void_finance_entry(uuid) from public,anon;
grant execute on function public.set_product_unit_cost(text,numeric),public.set_order_item_cost(bigint,numeric),public.add_finance_entry(date,text,numeric,text,uuid),public.void_finance_entry(uuid) to authenticated;

create function public.finance_overview(p_from date default null,p_to date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'INVALID_DATE_RANGE'; end if;
 with payment_rows as (
   select * from public.finance_payment_events e where
    ((p_from is null and p_to is null) or e.occurred_at is not null) and
    (p_from is null or e.occurred_at >= (p_from::timestamp at time zone 'Africa/Cairo')) and
    (p_to is null or e.occurred_at < ((p_to+1)::timestamp at time zone 'Africa/Cairo'))
 ), cost_orders as (select order_id,sum(cost_factor) as factor from payment_rows group by order_id having sum(cost_factor)<>0),
 cost_totals as (select coalesce(sum(e.factor*i.quantity*c.unit_cost),0) as known_cost,count(*) filter(where c.unit_cost is null) as missing_costs from cost_orders e join public.order_items i on i.order_id=e.order_id left join public.order_item_costs c on c.item_id=i.id),
 payment_totals as (select coalesce(sum(amount) filter(where amount>0),0) as collected,coalesce(-sum(amount) filter(where event_type='refund'),0) as refunded,coalesce(-sum(amount) filter(where event_type='correction'),0) as corrections,coalesce(sum(amount),0) as net_collected,coalesce(sum(item_amount),0) as items_collected,coalesce(sum(delivery_amount),0) as delivery_collected from payment_rows),
 entry_rows as (select * from public.finance_entries where voided_at is null and (p_from is null or entry_date>=p_from) and (p_to is null or entry_date<=p_to)),
 entry_totals as (select coalesce(sum(amount),0) as cash_spent,coalesce(sum(amount) filter(where category='inventory'),0) as inventory_spent,coalesce(sum(amount) filter(where category<>'inventory'),0) as operating_spent from entry_rows)
 select jsonb_build_object('collected',p.collected,'refunded',p.refunded,'corrections',p.corrections,'net_collected',p.net_collected,'items_collected',p.items_collected,'delivery_collected',p.delivery_collected,'cash_spent',x.cash_spent,'inventory_spent',x.inventory_spent,'operating_spent',x.operating_spent,'known_product_cost',c.known_cost,'missing_cost_items',c.missing_costs,'cash_balance',p.net_collected-x.cash_spent,'gross_profit',case when c.missing_costs=0 then p.net_collected-c.known_cost end,'operating_result',case when c.missing_costs=0 then p.net_collected-c.known_cost-x.operating_spent end,'gross_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost)/p.net_collected*100,2) end,'operating_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost-x.operating_spent)/p.net_collected*100,2) end,'opening_paid_orders',(select count(*) from public.finance_payment_events where event_type='opening_paid'),'opening_paid_amount',(select coalesce(sum(amount),0) from public.finance_payment_events where event_type='opening_paid'),'tracking_started_at',(select started_at from private.finance_tracking_start),'untracked_refunded_orders',(select untracked_refunded_orders from private.finance_tracking_start),'categories',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',amount)),'[]'::jsonb) from (select category,sum(amount) as amount from entry_rows group by category) q)) into result from payment_totals p cross join cost_totals c cross join entry_totals x;
 return result;
end $$;
create function public.finance_missing_costs() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('item_id',q.id,'order_number',q.order_number,'name_en',q.name_en,'name_ar',q.name_ar,'quantity',q.quantity)),'[]'::jsonb) from (
 select i.id,o.order_number,i.name_en,i.name_ar,i.quantity from public.order_items i join public.orders o on o.id=i.order_id join public.order_item_costs c on c.item_id=i.id where c.unit_cost is null and exists(select 1 from public.finance_payment_events e where e.order_id=o.id group by e.order_id having sum(e.cost_factor)<>0) order by o.created_at desc,i.id limit 100) q);
end $$;
revoke all on function public.finance_overview(date,date),public.finance_missing_costs() from public,anon;
grant execute on function public.finance_overview(date,date),public.finance_missing_costs() to authenticated;
