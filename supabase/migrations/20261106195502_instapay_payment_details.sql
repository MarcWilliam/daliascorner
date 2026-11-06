-- Preserve legacy intent/instructions; do not invent a recipient or reroute older orders.
alter table public.checkout_settings
 add column instapay_link text not null default '',
 add column instapay_number text not null default '',
 add constraint checkout_instapay_link_format check(instapay_link='' or (length(instapay_link)<=2048 and instapay_link ~ '^https://ipn[.]eg/[^[:space:]?#][^[:space:]]*$' and instapay_link !~ '[[:cntrl:]]')),
 add constraint checkout_instapay_number_format check(instapay_number='' or (instapay_number !~ '[[:space:][:cntrl:]]' and (instapay_number ~ '^01[0125][0-9]{8}$' or instapay_number ~* '^[a-z0-9._-]{1,100}@instapay$')));
alter table public.orders
 add column instapay_link text,
 add column instapay_number text;

create function private.snapshot_instapay_order() returns trigger language plpgsql security definer set search_path='' as $$
declare settings public.checkout_settings; fresh boolean;
begin
 fresh := case when tg_op='INSERT' then new.guest_token_hash is not null else old.guest_token_hash is null and new.guest_token_hash is not null end;
 if new.payment_method='transfer' and not new.is_historical and fresh then
  select * into settings from public.checkout_settings where id=true for share;
  if not found or not settings.transfer_enabled or (settings.instapay_link='' and settings.instapay_number='') then raise exception 'INVALID_PAYMENT'; end if;
  new.instapay_link:=nullif(settings.instapay_link,'');
  new.instapay_number:=nullif(settings.instapay_number,'');
 end if;
 return new;
end $$;
revoke all on function private.snapshot_instapay_order() from public,anon,authenticated;
create trigger snapshot_instapay_order before insert or update on public.orders for each row execute function private.snapshot_instapay_order();

-- Preserve retry identity across sign-in; linked orders remain owner-only.
create or replace function public.create_website_order(p_key uuid,p_hash text,p_customer jsonb,p_lines jsonb,p_locale text,p_token uuid,p_zone uuid,p_payment text,p_user uuid,p_consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.orders; z public.delivery_zones; settings public.checkout_settings; token_hash text;
begin
 if p_token is null then raise exception 'INVALID_ORDER'; end if;
 token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where idempotency_key=p_key;
 if found then
  if o.guest_token_hash is distinct from token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if o.customer_id is not null and o.customer_id is distinct from p_user then raise exception 'ORDER_NOT_AVAILABLE'; end if;
 else
  select * into z from public.delivery_zones where id=p_zone and active for share;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
  select * into settings from public.checkout_settings where id=true for share;
  if not found or p_payment is null or p_payment not in ('cash','transfer') or (p_payment='cash' and not settings.cash_enabled) or (p_payment='transfer' and (not settings.transfer_enabled or (settings.instapay_link='' and settings.instapay_number=''))) then raise exception 'INVALID_PAYMENT'; end if;
 end if;
 result:=public.create_store_order(p_key,p_hash,p_customer,p_lines,p_locale);
 if o.id is null then
  update public.orders set customer_id=p_user,guest_token_hash=token_hash,delivery_fee=z.fee,delivery_zone=case when p_locale='ar' then z.name_ar else z.name_en end,payment_method=p_payment,transfer_instructions=case when p_payment='transfer' then settings.transfer_instructions end,marketing_consent=coalesce(p_consent,false) where idempotency_key=p_key returning * into o;
 end if;
 return result||jsonb_build_object('delivery_fee',o.delivery_fee,'total',o.subtotal+o.delivery_fee,'payment_method',o.payment_method,'instapay_link',o.instapay_link,'instapay_number',o.instapay_number,'transfer_instructions',o.transfer_instructions);
end $$;

create or replace function public.create_chat_order(
 p_key uuid,p_token uuid,p_customer jsonb,p_lines jsonb,p_locale text,
 p_zone uuid,p_payment text,p_paid boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := auth.uid();
 customer jsonb;
 lines jsonb;
 line jsonb;
 quantity numeric;
 payload_hash text;
 token_hash text;
 o public.orders;
 z public.delivery_zones;
 settings public.checkout_settings;
 result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_key is null or p_token is null or p_zone is null or p_paid is null
    or p_locale is null or p_locale not in ('en','ar')
    or p_payment is null or p_payment not in ('cash','transfer')
    or jsonb_typeof(p_customer) is distinct from 'object' then
  raise exception 'INVALID_ORDER';
 end if;
 if jsonb_typeof(p_customer->'name') is distinct from 'string'
    or jsonb_typeof(p_customer->'phone') is distinct from 'string'
    or jsonb_typeof(p_customer->'address') is distinct from 'string' then
  raise exception 'INVALID_ORDER';
 end if;
 customer:=jsonb_build_object('name',trim(p_customer->>'name'),'phone',trim(p_customer->>'phone'),'address',trim(p_customer->>'address'));
 if length(customer->>'name') not between 2 and 120
    or length(customer->>'phone') not between 7 and 30
    or length(customer->>'address') not between 5 and 500
    or (p_customer->>'name') ~ '[[:cntrl:]]'
    or (p_customer->>'phone') ~ '[[:cntrl:]]'
    or (p_customer->>'address') ~ '[[:cntrl:]]'
    or (customer->>'phone') !~ '^[+]?[0-9 ()-]+$'
    or length(regexp_replace(customer->>'phone','[^0-9]','','g'))<7 then
  raise exception 'INVALID_ORDER';
 end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'INVALID_ORDER'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'INVALID_ORDER'; end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(line) is distinct from 'object'
     or jsonb_typeof(line->'id') is distinct from 'string'
     or (line->>'id') !~ '^[a-z0-9-]{1,100}$'
     or jsonb_typeof(line->'qty') is distinct from 'number' then
   raise exception 'INVALID_ORDER';
  end if;
  quantity:=(line->>'qty')::numeric;
  if quantity<1 or quantity>99 or quantity<>trunc(quantity) then raise exception 'INVALID_ORDER'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_lines)) then raise exception 'INVALID_ORDER'; end if;
 select jsonb_agg(jsonb_build_object('id',value->>'id','qty',(value->>'qty')::integer) order by value->>'id') into lines from jsonb_array_elements(p_lines);
 token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 payload_hash:=encode(sha256(convert_to(jsonb_build_object(
  'kind','chat-order-v1','actor',actor_id,'token',p_token,'customer',customer,
  'lines',lines,'locale',p_locale,'zone',p_zone,'payment',p_payment,'paid',p_paid
 )::text,'UTF8')),'hex');

 -- Same token cannot create two orders, including concurrent requests with different keys.
 perform pg_advisory_xact_lock(hashtextextended('chat-token:'||p_token::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where idempotency_key=p_key for update;
 if found then
  if o.source<>'chat' or o.recorded_by is distinct from actor_id
     or o.request_hash<>payload_hash or o.guest_token_hash is distinct from token_hash then
   raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
  -- Return the latest state. Never repeat the original payment or fulfillment action.
  result:=public.create_store_order(p_key,payload_hash,customer,lines,p_locale);
 else
  if exists(select 1 from public.orders where guest_token_hash=token_hash) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  select * into z from public.delivery_zones where id=p_zone and active for share;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
  select * into settings from public.checkout_settings where id=true for share;
  if not found or (p_payment='cash' and not settings.cash_enabled)
     or (p_payment='transfer' and (not settings.transfer_enabled or (settings.instapay_link='' and settings.instapay_number=''))) then
   raise exception 'INVALID_PAYMENT';
  end if;
  result:=public.create_store_order(p_key,payload_hash,customer,lines,p_locale);
  update public.orders set source='chat',recorded_by=actor_id,customer_id=null,
   guest_token_hash=token_hash,delivery_fee=z.fee,
   delivery_zone=case when p_locale='ar' then z.name_ar else z.name_en end,
   payment_method=p_payment,
   transfer_instructions=case when p_payment='transfer' then settings.transfer_instructions end,
   marketing_consent=false,meta_context='{}'::jsonb,source_url=''
   where idempotency_key=p_key returning * into o;
  perform public.transition_order(o.id,'confirmed');
  -- All price/fee snapshots are finalized before finance records a receipt.
  if p_paid then perform public.set_order_payment(o.id,'paid'); end if;
  select * into o from public.orders where id=o.id;
 end if;
 return result||jsonb_build_object(
  'id',o.id,'source',o.source,'order_number',o.order_number,'status',o.status,
  'payment_status',o.payment_status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,
  'delivery_zone',o.delivery_zone,'total',o.subtotal+o.delivery_fee,
  'payment_method',o.payment_method,'transfer_instructions',o.transfer_instructions,'instapay_link',o.instapay_link,'instapay_number',o.instapay_number,
  'expires_at',o.expires_at
 );
end $$;
revoke all on function public.create_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) to authenticated;

create or replace function public.guest_order(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,
  'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,'payment_method',o.payment_method,
  'transfer_instructions',o.transfer_instructions,'instapay_link',o.instapay_link,'instapay_number',o.instapay_number,'created_at',o.created_at,'ordered_at',o.ordered_at,
  'is_historical',o.is_historical,
  'items',(select jsonb_agg(jsonb_build_object('name_en',i.name_en,'name_ar',i.name_ar,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=o.id))
 from public.orders o where guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and customer_id is null;
$$;
