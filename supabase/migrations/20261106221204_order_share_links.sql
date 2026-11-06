-- Guest capability links are separately hashed; existing tracking links stay valid.
alter table public.orders add column order_total numeric generated always as (subtotal+delivery_fee) stored;
create table private.order_share_links (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 order_id uuid not null references public.orders(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '90 days',
 created_by uuid not null references auth.users(id)
);
create index order_share_links_order_idx on private.order_share_links(order_id);
create index order_share_links_expiry_idx on private.order_share_links(expires_at);
create index order_share_links_actor_idx on private.order_share_links(created_by);
alter table private.order_share_links enable row level security;
revoke all on private.order_share_links from public,anon,authenticated;

create function private.resolve_order_token(p_token uuid) returns uuid language sql stable security definer set search_path='' as $$
 select id from (
  select o.id from public.orders o where p_token is not null and o.guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex')
  union all
  select s.order_id from private.order_share_links s where p_token is not null and s.token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and s.expires_at>now()
 ) resolved limit 1;
$$;
revoke all on function private.resolve_order_token(uuid) from public,anon,authenticated;

create function public.create_order_share_link(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id is null or not exists(select 1 from public.orders where id=p_id) then raise exception 'ORDER_NOT_AVAILABLE'; end if;
 delete from private.order_share_links where expires_at<=now();
 insert into private.order_share_links(token_hash,order_id,created_by)
 values(encode(sha256(convert_to(token::text,'UTF8')),'hex'),p_id,auth.uid());
 return token;
end $$;
revoke all on function public.create_order_share_link(uuid) from public,anon,authenticated;
grant execute on function public.create_order_share_link(uuid) to authenticated;

create or replace function public.guest_order(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,
  'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,'payment_method',o.payment_method,
  'transfer_instructions',o.transfer_instructions,'instapay_link',o.instapay_link,'instapay_number',o.instapay_number,'created_at',o.created_at,'ordered_at',o.ordered_at,
  'is_historical',o.is_historical,
  'items',(select jsonb_agg(jsonb_build_object('name_en',i.name_en,'name_ar',i.name_ar,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=o.id))
 from public.orders o where o.id=private.resolve_order_token(p_token) and customer_id is null;
$$;

create or replace function public.claim_order(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'VERIFY_EMAIL'; end if;
 if public.is_admin() then raise exception 'ORDER_NOT_AVAILABLE'; end if;
 update public.orders set customer_id=auth.uid() where id=private.resolve_order_token(p_token) and (customer_id is null or customer_id=auth.uid());
 if not found then raise exception 'ORDER_NOT_AVAILABLE'; end if;
end $$;
revoke all on function public.claim_order(uuid) from public,anon,authenticated;
grant execute on function public.claim_order(uuid) to authenticated;
create or replace function public.revoke_order_marketing(p_token uuid) returns void language sql security definer set search_path='' as $$
 update public.orders set marketing_consent=false where id=private.resolve_order_token(p_token) and (customer_id is null or customer_id=auth.uid());
$$;
revoke all on function public.revoke_order_marketing(uuid) from public,anon,authenticated;
grant execute on function public.revoke_order_marketing(uuid) to anon,authenticated;
