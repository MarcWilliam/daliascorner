-- Keep recorded cash entries immutable. Apply admin corrections through an
-- append-only history and use the resulting cash view for all balances and reports.
create table private.order_payment_revisions (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.finance_payment_events(id),
  amount numeric(12,2) not null,
  item_amount numeric(12,2) not null,
  occurred_at timestamptz,
  reference text not null,
  deleted boolean not null,
  reason text not null default '',
  actor_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index order_payment_revisions_event_idx on private.order_payment_revisions(event_id,id desc);
alter table private.order_payment_revisions enable row level security;
revoke all on private.order_payment_revisions from public,anon,authenticated;
revoke all on sequence private.order_payment_revisions_id_seq from public,anon,authenticated;
create trigger order_payment_revisions_immutable before update or delete on private.order_payment_revisions
  for each row execute function private.prevent_order_finance_history_changes();
create trigger order_payment_revisions_no_truncate before truncate on private.order_payment_revisions
  for each statement execute function private.prevent_order_finance_history_changes();

-- Retain the last effective date for historical product-cost entries even
-- when the corresponding cash entry is deleted from the active ledger.
create view private.order_cash_entries with (security_invoker=true) as
select e.id, e.order_id, e.event_type, coalesce(r.amount,e.amount) as amount,
       coalesce(r.item_amount,e.item_amount) as item_amount,
       coalesce(r.amount-r.item_amount,e.delivery_amount) as delivery_amount,
       coalesce(r.occurred_at,d.corrected_date,e.occurred_at) as occurred_at,
       e.occurred_at as original_occurred_at, e.recorded_at,
       coalesce(r.reference,e.reference) as reference,
       coalesce(r.deleted,false) as deleted
from public.finance_payment_events e
left join lateral (
  select * from private.order_payment_revisions r where r.event_id=e.id order by r.id desc limit 1
) r on true
left join lateral (
  select d.corrected_date from private.order_payment_dates d where d.event_id=e.id order by d.id desc limit 1
) d on true;
revoke all on private.order_cash_entries from public,anon,authenticated;

create or replace function private.order_effective_payment_date(p_event bigint)
returns timestamptz language sql stable security definer set search_path='' as $$
  select occurred_at from private.order_cash_entries where id=p_event;
$$;

create or replace function private.reconcile_order_finance(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; received numeric; refunded numeric; net numeric; target numeric; state text; flag text;
begin
 select * into o from public.orders where id=p_id for update;
 if not found then return; end if;
 select coalesce(sum(amount) filter(where event_type<>'refund'),0),coalesce(-sum(amount) filter(where event_type='refund'),0) into received,refunded from private.order_cash_entries where order_id=p_id and not deleted;
 net:=received-refunded;target:=case when o.status in ('cancelled','expired') then 0 else o.order_total end;
 state:=case when net>target then 'overpaid' when net=target and target>0 then 'paid' when net>0 then 'partial' when refunded>0 then 'refunded' else 'unpaid' end;
 flag:=case when net>0 and (net>=target or target=0) then 'paid' when net=0 and refunded>0 then 'refunded' else 'unpaid' end;
 if not o.ops_managed then flag:=o.payment_status;end if;
 update public.orders set amount_received=received,amount_refunded=refunded,balance_due=greatest(target-net,0),refund_due=greatest(net-target,0),payment_state=state,payment_status=flag
 where id=p_id and (amount_received,amount_refunded,balance_due,refund_due,payment_state,payment_status) is distinct from (received,refunded,greatest(target-net,0),greatest(net-target,0),state,flag);
end $$;

create or replace function private.validate_order_cash_dates(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(
  with cash as (select amount,occurred_at as effective from private.order_cash_entries where order_id=p_id and not deleted),
  opening as (select coalesce(sum(amount),0) as amount from cash where effective is null),
  days as (select (effective at time zone 'Africa/Cairo')::date as day,sum(amount) as amount from cash where effective is not null group by 1)
  select 1 from opening where amount<0
  union all
  select 1 from (select (select amount from opening)+sum(amount) over(order by day) as balance from days) q where balance<0
 ) then raise exception 'INVALID_PAYMENT_SEQUENCE';end if;
end $$;

create or replace function private.apply_order_finance_action(
  p_order uuid,p_action text,p_payload jsonb,p_reason text,p_key uuid
) returns void language plpgsql security definer set search_path='' as $$
declare
  o public.orders;
  entry private.order_cash_entries;
  amount_value numeric;
  event_day date;
  event_time timestamptz;
  net numeric;
  item_net numeric;
  item_part numeric;
  reference_value text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found or not o.ops_managed then raise exception 'ORDER_NOT_AVAILABLE'; end if;

  if p_action in ('payment_edit','payment_delete','payment_date') then
    select * into entry from private.order_cash_entries
      where id=(p_payload->>'event_id')::bigint and order_id=p_order and not deleted;
    if not found or (entry.event_type='correction' and p_action<>'payment_date') then
      raise exception 'INVALID_PAYMENT';
    end if;
  elsif p_action not in ('payment','refund') then
    raise exception 'INVALID_FINANCE_ACTION';
  end if;

  event_time:=entry.occurred_at;
  if p_action<>'payment_delete' and not (
    p_action='payment_edit' and event_time is null and coalesce(p_payload->>'date','')=''
  ) then
    if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'INVALID_DATE';
    end if;
    begin
      event_day:=(p_payload->>'date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'INVALID_DATE';
    end;
    if event_day>(now() at time zone 'Africa/Cairo')::date or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date then
      raise exception 'INVALID_DATE';
    end if;
    if event_day is distinct from (event_time at time zone 'Africa/Cairo')::date then
      event_time:=(event_day+time '12:00') at time zone 'Africa/Cairo';
    end if;
  end if;

  amount_value:=entry.amount;
  item_part:=entry.item_amount;
  reference_value:=entry.reference;
  if p_action in ('payment','refund','payment_edit') then
    if jsonb_typeof(p_payload->'amount') is distinct from 'number' then
      raise exception 'INVALID_AMOUNT';
    end if;
    amount_value:=(p_payload->>'amount')::numeric;
    if amount_value<=0 or amount_value>9999999999.99 or amount_value<>round(amount_value,2) then
      raise exception 'INVALID_AMOUNT';
    end if;
    reference_value:=coalesce(p_payload->>'reference','');
    if length(reference_value)>300 or reference_value ~ '[[:cntrl:]]' then
      raise exception 'INVALID_REFERENCE';
    end if;
    reference_value:=trim(reference_value);
  end if;

  if p_action in ('payment_edit','payment_delete','payment_date') then
    if p_action='payment_edit' then
      -- Keep the original allocation between product revenue and delivery.
      if entry.event_type='refund' then amount_value:=-amount_value; end if;
      item_part:=round(amount_value*coalesce(
        entry.item_amount/nullif(entry.amount,0),o.subtotal/nullif(o.order_total,0),1
      ),2);
    end if;
    insert into private.order_payment_revisions(event_id,amount,item_amount,occurred_at,reference,deleted,reason,actor_id)
      values(entry.id,amount_value,item_part,event_time,reference_value,p_action='payment_delete',trim(p_reason),auth.uid());
  else
    if p_action='payment' then
      if o.status in ('cancelled','expired') then raise exception 'REOPEN_BEFORE_PAYMENT'; end if;
      if o.order_total<=0 then raise exception 'INVALID_TOTAL'; end if;
      item_part:=round(amount_value*o.subtotal/o.order_total,2);
    else
      select coalesce(sum(amount),0),coalesce(sum(item_amount),0) into net,item_net
        from private.order_cash_entries where order_id=p_order and not deleted;
      if amount_value>net then raise exception 'REFUND_EXCEEDS_RECEIPTS'; end if;
      amount_value:=-amount_value;
      item_part:=round(amount_value*item_net/net,2);
    end if;
    insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor,reference)
      values(p_order,p_action,amount_value,item_part,amount_value-item_part,0,event_time,auth.uid(),reference_value);
  end if;
  perform private.validate_order_cash_dates(p_order);
end $$;

create or replace function private.order_finance_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('amount_received',o.amount_received,'amount_refunded',o.amount_refunded,'net_collected',o.amount_received-o.amount_refunded,'balance_due',o.balance_due,'refund_due',o.refund_due,'payment_state',o.payment_state,'cost_policy',case when o.ops_managed then 'shipped_less_restocked' else 'legacy_paid_order' end,
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'amount',e.amount,'occurred_at',e.occurred_at,'original_occurred_at',e.original_occurred_at,'recorded_at',e.recorded_at,'reference',e.reference) order by e.id desc),'[]'::jsonb) from private.order_cash_entries e where e.order_id=o.id and not e.deleted)) into result from public.orders o where o.id=p_id;
 return result;
end $$;

create or replace function public.finance_overview(p_from date default null,p_to date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to)) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_DATE_RANGE'; end if;
 with payment_rows as (
   select e.* from private.order_cash_entries e where not e.deleted and
    ((p_from is null and p_to is null) or e.occurred_at is not null) and
    (p_from is null or e.occurred_at >= (p_from::timestamp at time zone 'Africa/Cairo')) and
    (p_to is null or e.occurred_at < ((p_to+1)::timestamp at time zone 'Africa/Cairo'))
 ), cost_rows as (
 select e.* from private.order_cost_events e
 cross join lateral (select case when e.finance_event_id is not null then private.order_effective_payment_date(e.finance_event_id) else e.occurred_at end as effective_date) d
 where ((p_from is null and p_to is null) or d.effective_date is not null)
 and (p_from is null or d.effective_date >= (p_from::timestamp at time zone 'Africa/Cairo'))
 and (p_to is null or d.effective_date < ((p_to+1)::timestamp at time zone 'Africa/Cairo'))
 ), cost_quantities as (select item_id,sum(quantity_delta) as quantity from cost_rows group by item_id having sum(quantity_delta)<>0),
 cost_totals as (select coalesce(sum(e.quantity*c.unit_cost),0) as known_cost,count(*) filter(where c.unit_cost is null) as missing_costs from cost_quantities e left join public.order_item_costs c on c.item_id=e.item_id),
 payment_totals as (select coalesce(sum(amount) filter(where amount>0),0) as collected,coalesce(-sum(amount) filter(where event_type='refund'),0) as refunded,coalesce(-sum(amount) filter(where event_type='correction'),0) as corrections,coalesce(sum(amount),0) as net_collected,coalesce(sum(item_amount),0) as items_collected,coalesce(sum(delivery_amount),0) as delivery_collected from payment_rows),
 entry_rows as (select * from public.finance_entries where voided_at is null and (p_from is null or entry_date>=p_from) and (p_to is null or entry_date<=p_to)),
 entry_totals as (select coalesce(sum(amount),0) as cash_spent,coalesce(sum(amount) filter(where category='inventory'),0) as inventory_spent,coalesce(sum(amount) filter(where category<>'inventory'),0) as operating_spent from entry_rows)
 select jsonb_build_object('collected',p.collected,'refunded',p.refunded,'corrections',p.corrections,'net_collected',p.net_collected,'items_collected',p.items_collected,'delivery_collected',p.delivery_collected,'cash_spent',x.cash_spent,'inventory_spent',x.inventory_spent,'operating_spent',x.operating_spent,'known_product_cost',c.known_cost,'missing_cost_items',c.missing_costs,'cash_balance',p.net_collected-x.cash_spent,'gross_profit',case when c.missing_costs=0 then p.net_collected-c.known_cost end,'operating_result',case when c.missing_costs=0 then p.net_collected-c.known_cost-x.operating_spent end,'gross_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost)/p.net_collected*100,2) end,'operating_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost-x.operating_spent)/p.net_collected*100,2) end,'opening_paid_orders',(select count(*) from private.order_cash_entries where event_type='opening_paid' and not deleted),'opening_paid_amount',(select coalesce(sum(amount),0) from private.order_cash_entries where event_type='opening_paid' and not deleted),'cost_policy','legacy_receipt_costs_then_managed_shipped_costs','tracking_started_at',(select started_at from private.finance_tracking_start),'untracked_refunded_orders',(select untracked_refunded_orders from private.finance_tracking_start),'categories',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',amount)),'[]'::jsonb) from (select category,sum(amount) as amount from entry_rows group by category) q)) into result from payment_totals p cross join cost_totals c cross join entry_totals x;
 return result;
end $$;

create or replace function public.finance_recent_payments(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_LIMIT'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.recorded_at desc,q.id desc),'[]'::jsonb) into result from (
  select e.id,e.event_type,e.amount,e.occurred_at,e.original_occurred_at,e.recorded_at,e.reference,jsonb_build_object('order_number',o.order_number) as orders
  from private.order_cash_entries e join public.orders o on o.id=e.order_id where not e.deleted order by e.recorded_at desc,e.id desc limit p_limit
 ) q;
 return result;
end $$;

create or replace function public.admin_order_action(p_id uuid,p_revision bigint,p_key uuid,p_action text,p_payload jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; i public.order_items; stock public.inventory; zone public.delivery_zones; shipment private.order_shipments; line jsonb; qty integer; desired integer; delta integer; held integer; req_hash text; previous private.order_action_requests; result jsonb; snapshot jsonb; today date:=(now() at time zone 'Africa/Cairo')::date; event_day date; effective timestamptz:=now(); sid uuid; rid uuid; allocation record; needed integer; allocated integer; returned_delivered integer; any_shipped boolean; total_qty bigint; requested_zone uuid; zone_changed boolean; address_changed boolean;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 p_reason:=coalesce(p_reason,'');
 if p_id is null or p_revision is null or p_key is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or length(trim(p_reason))>1000 then raise exception 'INVALID_ACTION'; end if;
 req_hash:=encode(sha256(convert_to(jsonb_build_object('order',p_id,'revision',p_revision,'action',p_action,'payload',p_payload,'reason',p_reason)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into previous from private.order_action_requests where actor_id=auth.uid() and request_key=p_key;
 if found then if previous.request_hash<>req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return previous.result; end if;
 select * into o from public.orders where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.revision<>p_revision then raise exception 'ORDER_CHANGED'; end if;
 snapshot:=(to_jsonb(o)-array['guest_token_hash','request_hash','idempotency_key','meta_context'])||jsonb_build_object('items',(select jsonb_agg(to_jsonb(x)) from public.order_items x where order_id=p_id));
 perform private.manage_order(p_id);
 -- Lock all affected products once, in the same order as website checkout.
 perform 1 from public.inventory where product_id in(select product_id from public.order_items where order_id=p_id union select value->>'product_id' from jsonb_array_elements(coalesce(p_payload->'additions','[]'))) order by product_id for update;
 select exists(select 1 from public.order_items where order_id=p_id and shipped_quantity>0) into any_shipped;
 if p_action='manage' then
  null;
 elsif p_action='details' then
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'phone') is distinct from 'string' or jsonb_typeof(p_payload->'address') is distinct from 'string' or p_payload->>'locale' is null or coalesce(p_payload->>'name','') ~ '[[:cntrl:]]' or coalesce(p_payload->>'phone','') ~ '[[:cntrl:]]' or coalesce(p_payload->>'address','') ~ '[[:cntrl:]]' or length(trim(p_payload->>'name')) not between 2 and 120 or length(trim(p_payload->>'phone')) not between 7 and 30 or length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7 or length(trim(p_payload->>'address')) not between 5 and 500 or (p_payload->>'phone') !~ '^[+]?[0-9 ()-]+$' or p_payload->>'locale' not in ('en','ar') then raise exception 'INVALID_CUSTOMER'; end if;
  requested_zone:=nullif(p_payload->>'zone_id','')::uuid;
  -- A blank zone means keep the recorded route, including unknown legacy areas.
  zone_changed:=requested_zone is not null and requested_zone is distinct from o.delivery_zone_id;
  address_changed:=trim(p_payload->>'address') is distinct from trim(o.customer_address);
  if any_shipped and (zone_changed or address_changed) and (p_payload->'delivery_change_confirmed') is distinct from 'true'::jsonb then raise exception 'DELIVERY_CHANGE_CONFIRMATION_REQUIRED'; end if;
  if zone_changed then
   select * into zone from public.delivery_zones where id=requested_zone and active for share;
   if not found then raise exception 'INVALID_DELIVERY'; end if;
  end if;
  update public.orders set customer_name=trim(p_payload->>'name'),customer_phone=trim(p_payload->>'phone'),customer_address=trim(p_payload->>'address'),locale=p_payload->>'locale',
   delivery_zone_id=case when zone_changed then zone.id else o.delivery_zone_id end,
   delivery_zone=case when zone_changed then case when p_payload->>'locale'='ar' then zone.name_ar else zone.name_en end else o.delivery_zone end,
   delivery_fee=case when zone_changed then zone.fee else o.delivery_fee end
   where id=p_id;
 elsif p_action='items' then
  if o.status in ('cancelled','expired') then raise exception 'REOPEN_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_payload->'lines','[]'))<>'array' or jsonb_typeof(coalesce(p_payload->'additions','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'lines','[]'))+jsonb_array_length(coalesce(p_payload->'additions','[]'))>100 then raise exception 'INVALID_ITEMS'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'lines','[]')) group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'lines','[]')) loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) then raise exception 'INVALID_QUANTITY'; end if;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found then raise exception 'INVALID_ITEM'; end if;
   desired:=(line->>'quantity')::integer;
   if desired<i.shipped_quantity or desired>i.quantity-i.removed_quantity then raise exception 'INVALID_QUANTITY'; end if;
   delta:=i.quantity-i.removed_quantity-desired; held:=least(delta,i.reserved_quantity);
   if held>0 then update public.inventory set reserved=reserved-held where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-held,'admin_items_removed',auth.uid()); end if;
   update public.order_items set removed_quantity=removed_quantity+delta,reserved_quantity=reserved_quantity-held where id=i.id;
  end loop;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'additions','[]')) loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
   qty:=(line->>'quantity')::integer;
   select * into stock from public.inventory where product_id=line->>'product_id';
   if not found or not stock.active or (not stock.unlimited_stock and stock.on_hand-stock.reserved<qty) then raise exception 'OUT_OF_STOCK'; end if;
   insert into public.order_items(order_id,product_id,name_en,name_ar,quantity,unit_price,stock_tracked,reserved_quantity) values(p_id,stock.product_id,stock.name_en,stock.name_ar,qty,stock.price,not stock.unlimited_stock,case when stock.unlimited_stock then 0 else qty end);
   if not stock.unlimited_stock then update public.inventory set reserved=reserved+qty where product_id=stock.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(stock.product_id,p_id,qty,'admin_items_added',auth.uid()); end if;
  end loop;
 elsif p_action='confirm' then
  if o.status<>'pending' then raise exception 'INVALID_TRANSITION'; end if;
  if o.payment_status<>'paid' and o.expires_at<=now() then raise exception 'ORDER_EXPIRED'; end if;
  update public.orders set status='confirmed' where id=p_id;
 elsif p_action='ship' then
  if o.status not in ('confirmed','shipped') then raise exception 'INVALID_TRANSITION'; end if;
  event_day:=(p_payload->>'dispatched_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date or length(coalesce(p_payload->>'courier',''))>120 or length(coalesce(p_payload->>'tracking_number',''))>200 or jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'INVALID_SHIPMENT'; end if;
  if p_payload->>'expected_on' is not null and ((p_payload->>'expected_on')::date<event_day or not isfinite((p_payload->>'expected_on')::date)) then raise exception 'INVALID_DATE'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
   qty:=(line->>'quantity')::integer;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found or qty>i.quantity-i.removed_quantity-i.shipped_quantity then raise exception 'INVALID_QUANTITY'; end if;
   held:=least(qty,i.reserved_quantity);
   if i.stock_tracked then
    select * into stock from public.inventory where product_id=i.product_id;
    if stock.on_hand-stock.reserved<qty-held then raise exception 'OUT_OF_STOCK'; end if;
    update public.inventory set on_hand=on_hand-qty,reserved=reserved-held where product_id=i.product_id;
    insert into public.stock_movements(product_id,order_id,on_hand_delta,reserved_delta,reason,actor) values(i.product_id,p_id,-qty,-held,'partial_shipment',auth.uid());
   end if;
   update public.order_items set shipped_quantity=shipped_quantity+qty,reserved_quantity=reserved_quantity-held where id=i.id;
  end loop;
  -- Every unshipped remainder becomes an unreserved backorder, never a cancellation.
  for i in select * from public.order_items where order_id=p_id and reserved_quantity>0 loop
   update public.inventory set reserved=reserved-i.reserved_quantity where product_id=i.product_id;
   insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-i.reserved_quantity,'shipment_remainder_released',auth.uid());
   update public.order_items set reserved_quantity=0 where id=i.id;
  end loop;
  insert into private.order_shipments(order_id,courier,tracking_number,dispatched_on,expected_on,lines) values(p_id,coalesce(p_payload->>'courier',''),coalesce(p_payload->>'tracking_number',''),event_day,(p_payload->>'expected_on')::date,p_payload->'lines');
  effective:=(event_day+time '12:00') at time zone 'Africa/Cairo';
 elsif p_action='deliver' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  event_day:=(p_payload->>'delivered_on')::date;
  if not found or shipment.voided_at is not null or shipment.legacy_delivered or shipment.delivered_on is not null or event_day is null or not isfinite(event_day) or event_day<coalesce(shipment.dispatched_on,(o.ordered_at at time zone 'Africa/Cairo')::date) or event_day>today then raise exception 'INVALID_DELIVERY'; end if;
  if not exists(select 1 from jsonb_array_elements(shipment.lines) l where (l->>'quantity')::integer>coalesce((select sum(a.quantity) from private.order_return_allocations a where a.shipment_id=shipment.id and a.item_id=(l->>'item_id')::bigint),0)) then raise exception 'NO_ITEMS_TO_DELIVER'; end if;
  for line in select value from jsonb_array_elements(shipment.lines) loop
   select coalesce(sum(a.quantity),0)::integer into allocated from private.order_return_allocations a where a.shipment_id=shipment.id and a.item_id=(line->>'item_id')::bigint;
   update public.order_items set delivered_quantity=delivered_quantity+(line->>'quantity')::integer-allocated where id=(line->>'item_id')::bigint;
  end loop;
  update private.order_shipments set delivered_on=event_day where id=shipment.id;
 elsif p_action='shipment_details' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  event_day:=(p_payload->>'dispatched_on')::date;
  if not found or shipment.voided_at is not null or (event_day is null and not shipment.legacy_import) or (event_day is not null and (not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date)) or length(coalesce(p_payload->>'courier',''))>120 or length(coalesce(p_payload->>'tracking_number',''))>200 then raise exception 'INVALID_SHIPMENT'; end if;
  if shipment.dispatched_on is not null and shipment.dispatched_on is distinct from event_day then raise exception 'DISPATCH_DATE_IMMUTABLE'; end if;
  if p_payload->>'expected_on' is not null and (not isfinite((p_payload->>'expected_on')::date) or (p_payload->>'expected_on')::date<coalesce(event_day,(o.ordered_at at time zone 'Africa/Cairo')::date)) then raise exception 'INVALID_DATE'; end if;
  if shipment.delivered_on is not null and shipment.delivered_on<event_day then raise exception 'INVALID_DATE'; end if;
  if p_payload->>'delivered_on' is not null and exists(select 1 from private.order_return_allocations a join private.order_returns r on r.id=a.return_id where a.shipment_id=shipment.id and a.after_delivery and r.returned_on<(p_payload->>'delivered_on')::date) then raise exception 'DELIVERY_AFTER_RETURN'; end if;
  if p_payload->>'delivered_on' is not null and (not(shipment.legacy_delivered or shipment.delivered_on is not null) or not isfinite((p_payload->>'delivered_on')::date) or (p_payload->>'delivered_on')::date<coalesce(event_day,(o.ordered_at at time zone 'Africa/Cairo')::date) or (p_payload->>'delivered_on')::date>today) then raise exception 'INVALID_DELIVERY'; end if;
  update private.order_shipments set courier=coalesce(p_payload->>'courier',''),tracking_number=coalesce(p_payload->>'tracking_number',''),dispatched_on=event_day,expected_on=(p_payload->>'expected_on')::date,delivered_on=coalesce((p_payload->>'delivered_on')::date,delivered_on) where id=shipment.id;
 elsif p_action='return' then
  event_day:=(p_payload->>'returned_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date or jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'INVALID_RETURN'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  rid:=gen_random_uuid();
  insert into private.order_returns(id,order_id,returned_on,lines,reason) values(rid,p_id,event_day,p_payload->'lines',p_reason);
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 or jsonb_typeof(line->'restock')<>'boolean' then raise exception 'INVALID_RETURN'; end if;
   qty:=(line->>'quantity')::integer;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found or qty>i.shipped_quantity-i.returned_quantity then raise exception 'INVALID_RETURN'; end if;
   needed:=qty;returned_delivered:=0;
   for allocation in
    select sh.id,((l->>'quantity')::integer-coalesce((select sum(a.quantity) from private.order_return_allocations a where a.shipment_id=sh.id and a.item_id=i.id),0))::integer as available,
      (sh.legacy_delivered or sh.delivered_on is not null) as completed
    from private.order_shipments sh cross join lateral jsonb_array_elements(sh.lines) l
    where sh.order_id=p_id and sh.voided_at is null and (l->>'item_id')::bigint=i.id
      and (p_payload->>'shipment_id' is null or sh.id=(p_payload->>'shipment_id')::uuid)
      and coalesce(sh.dispatched_on,(o.ordered_at at time zone 'Africa/Cairo')::date)<=event_day
      and (sh.delivered_on is null or sh.delivered_on<=event_day)
    order by (sh.legacy_delivered or sh.delivered_on is not null) desc,sh.dispatched_on nulls first,sh.created_at,sh.id
   loop
    allocated:=least(needed,allocation.available);
    if allocated>0 then
     insert into private.order_return_allocations(order_id,return_id,shipment_id,item_id,quantity,after_delivery) values(p_id,rid,allocation.id,i.id,allocated,allocation.completed);
     if allocation.completed then returned_delivered:=returned_delivered+allocated;end if;
     needed:=needed-allocated;
    end if;
    exit when needed=0;
   end loop;
   if needed<>0 then raise exception 'RETURN_BEFORE_SHIPMENT';end if;
   update public.order_items set returned_quantity=returned_quantity+qty,returned_after_delivery_quantity=returned_after_delivery_quantity+returned_delivered,restocked_quantity=restocked_quantity+case when (line->>'restock')::boolean then qty else 0 end where id=i.id;
   if (i.stock_tracked or (o.is_historical and not (select unlimited_stock from public.inventory where product_id=i.product_id))) and (line->>'restock')::boolean then update public.inventory set on_hand=on_hand+qty where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,on_hand_delta,reason,actor) values(i.product_id,p_id,qty,'returned_restocked',auth.uid()); end if;
  end loop;
  if p_payload ? 'waive_delivery' and jsonb_typeof(p_payload->'waive_delivery') is distinct from 'boolean' then raise exception 'INVALID_RETURN'; end if;
  if coalesce((p_payload->>'waive_delivery')::boolean,false) then
   if not any_shipped or exists(select 1 from public.order_items where order_id=p_id and quantity-removed_quantity-returned_quantity>0) then raise exception 'DELIVERY_WAIVER_REQUIRES_FULL_RETURN'; end if;
   update public.orders set delivery_fee=0 where id=p_id;
  end if;
  effective:=(event_day+time '12:00') at time zone 'Africa/Cairo';
 elsif p_action='waive_delivery' then
  if not any_shipped or exists(select 1 from public.order_items where order_id=p_id and quantity-removed_quantity-returned_quantity>0) then raise exception 'DELIVERY_WAIVER_REQUIRES_FULL_RETURN'; end if;
  update public.orders set delivery_fee=0 where id=p_id;
 elsif p_action='cancel' then
  if o.status in ('cancelled','expired') then raise exception 'INVALID_TRANSITION'; end if;
  for i in select * from public.order_items where order_id=p_id loop
   if i.reserved_quantity>0 then update public.inventory set reserved=reserved-i.reserved_quantity where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-i.reserved_quantity,'admin_cancelled_remainder',auth.uid()); end if;
   update public.order_items set cancelled_quantity=cancelled_quantity+(quantity-removed_quantity-shipped_quantity),removed_quantity=quantity-shipped_quantity,reserved_quantity=0 where id=i.id;
  end loop;
  if not any_shipped then update public.orders set status='cancelled' where id=p_id; end if;
 elsif p_action='reopen' then
  if (o.status not in ('cancelled','expired') and not exists(select 1 from public.order_items where order_id=p_id and cancelled_quantity>0)) or o.is_historical then raise exception 'INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.delivery_zones z where z.id=(select delivery_zone_id from public.orders where id=p_id) and z.active) then raise exception 'INVALID_DELIVERY'; end if;
  -- Reopen restores cancellation-induced removals only and rechecks current stock.
  for i in select * from public.order_items where order_id=p_id order by product_id loop
   qty:=i.quantity-i.removed_quantity+i.cancelled_quantity-i.shipped_quantity;
   held:=greatest(qty-i.reserved_quantity,0);
   if i.stock_tracked and held>0 then select * into stock from public.inventory where product_id=i.product_id; if not stock.active or stock.on_hand-stock.reserved<held then raise exception 'OUT_OF_STOCK'; end if; update public.inventory set reserved=reserved+held where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,held,'order_reopened',auth.uid()); end if;
   update public.order_items set removed_quantity=removed_quantity-cancelled_quantity,cancelled_quantity=0,reserved_quantity=case when stock_tracked then qty else 0 end where id=i.id;
  end loop;
  update public.orders set status=case when any_shipped then 'confirmed' else 'pending' end,expires_at=now()+interval '24 hours',delivery_fee=case when any_shipped then delivery_fee else coalesce((select fee from public.delivery_zones where id=delivery_zone_id),delivery_fee) end where id=p_id;
 elsif p_action='extend' then
  if o.status<>'pending' or (p_payload->>'expires_at')::timestamptz<=now() or (p_payload->>'expires_at')::timestamptz>now()+interval '30 days' or not isfinite((p_payload->>'expires_at')::timestamptz) then raise exception 'INVALID_EXTENSION'; end if;
  update public.orders set expires_at=(p_payload->>'expires_at')::timestamptz where id=p_id;
 elsif p_action='undo_shipment' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  if not found or shipment.voided_at is not null or shipment.legacy_delivered or shipment.delivered_on is not null or (p_payload->>'confirmed_not_dispatched')::boolean is distinct from true then raise exception 'INVALID_UNDO'; end if;
  if exists(select 1 from public.order_items where order_id=p_id and returned_quantity>0) then raise exception 'USE_RETURN_FLOW'; end if;
  for line in select value from jsonb_array_elements(shipment.lines) loop
   select * into i from public.order_items where id=(line->>'item_id')::bigint;qty:=(line->>'quantity')::integer;
   update public.order_items set shipped_quantity=shipped_quantity-qty where id=i.id;
   if i.stock_tracked then update public.inventory set on_hand=on_hand+qty where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,on_hand_delta,reason,actor) values(i.product_id,p_id,qty,'shipment_recording_corrected',auth.uid()); end if;
  end loop;
  update private.order_shipments set voided_at=now() where id=shipment.id;
  update public.orders set status='confirmed' where id=p_id;
 elsif p_action='order_date' then
  event_day:=(p_payload->>'ordered_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or exists(select 1 from private.order_shipments where order_id=p_id and dispatched_on<event_day and voided_at is null) or exists(select 1 from private.order_returns where order_id=p_id and returned_on<event_day) then raise exception 'INVALID_DATE'; end if;
  if exists(select 1 from private.order_cash_entries where order_id=p_id and not deleted and (occurred_at at time zone 'Africa/Cairo')::date<event_day) then raise exception 'INVALID_DATE'; end if;
  update public.orders set ordered_at=(event_day+time '12:00') at time zone 'Africa/Cairo' where id=p_id;
 elsif p_action='note' then
  if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(trim(p_payload->>'text')) not between 1 and 2000 then raise exception 'INVALID_NOTE'; end if;
 elsif p_action in ('payment','refund','payment_date','payment_edit','payment_delete') then
  execute 'select private.apply_order_finance_action($1,$2,$3,$4,$5)' using p_id,p_action,p_payload,p_reason,p_key;
 else raise exception 'INVALID_ACTION'; end if;
 perform private.recalculate_order(p_id);
 if to_regprocedure('private.sync_order_cost(uuid,timestamp with time zone)') is not null then execute 'select private.sync_order_cost($1,$2)' using p_id,effective; end if;
 -- Notes and counter-only actions must also invalidate stale editors.
 update public.orders set updated_at=clock_timestamp(),revision=revision+1 where id=p_id;
 select revision into p_revision from public.orders where id=p_id;
 insert into private.order_events(order_id,actor_id,actor_label,kind,reason,payload) values(p_id,auth.uid(),coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email',''),p_action,trim(p_reason),jsonb_build_object('request',p_payload,'before',snapshot,'after',(select to_jsonb(x)-array['guest_token_hash','request_hash','idempotency_key','meta_context'] from public.orders x where id=p_id)));
 result:=jsonb_build_object('revision',p_revision);
 insert into private.order_action_requests(actor_id,request_key,request_hash,result) values(auth.uid(),p_key,req_hash,result);
 return result;
end $$;
