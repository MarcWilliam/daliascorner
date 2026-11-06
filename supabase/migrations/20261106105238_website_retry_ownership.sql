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
  if not found or p_payment is null or p_payment not in ('cash','transfer') or (p_payment='cash' and not settings.cash_enabled) or (p_payment='transfer' and (not settings.transfer_enabled or length(trim(settings.transfer_instructions))=0)) then raise exception 'INVALID_PAYMENT'; end if;
 end if;
 result:=public.create_store_order(p_key,p_hash,p_customer,p_lines,p_locale);
 if o.id is null then
  update public.orders set customer_id=p_user,guest_token_hash=token_hash,delivery_fee=z.fee,delivery_zone=case when p_locale='ar' then z.name_ar else z.name_en end,payment_method=p_payment,transfer_instructions=case when p_payment='transfer' then settings.transfer_instructions end,marketing_consent=coalesce(p_consent,false) where idempotency_key=p_key returning * into o;
 end if;
 return result||jsonb_build_object('delivery_fee',o.delivery_fee,'total',o.subtotal+o.delivery_fee,'payment_method',o.payment_method);
end $$;
