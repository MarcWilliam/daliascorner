-- Supabase projects can grant table privileges through default ACLs. RLS does
-- not protect TRUNCATE, so configure these public checkout tables explicitly.
revoke all on public.delivery_zones,public.checkout_settings from public,anon,authenticated;
grant select on public.delivery_zones,public.checkout_settings to anon,authenticated;
grant insert,update,delete on public.delivery_zones to authenticated;
grant update on public.checkout_settings to authenticated;
grant all on public.delivery_zones,public.checkout_settings to service_role;

-- Customer details are deliberately independent from administrator membership.
-- No auth trigger or metadata import: a profile is created only by save/skip.
create table public.customer_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 phone text not null default '',
 delivery_address text not null default '',
 delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
 completed_at timestamptz,
 skipped_at timestamptz,
 updated_at timestamptz not null default now()
);
create index customer_profiles_delivery_zone_idx on public.customer_profiles(delivery_zone_id) where delivery_zone_id is not null;
alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from public,anon,authenticated;
grant select on public.customer_profiles to authenticated;
grant all on public.customer_profiles to service_role;
create policy own_customer_profile on public.customer_profiles for select to authenticated
 using(user_id=(select auth.uid()));

create function public.save_customer_profile(
 p_full_name text,p_phone text default '',p_delivery_address text default '',p_delivery_zone_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := auth.uid();
 clean_name text := trim(p_full_name);
 clean_phone text := trim(coalesce(p_phone,''));
 clean_address text := trim(coalesce(p_delivery_address,''));
 profile public.customer_profiles;
begin
 if actor_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
 if clean_name is null or length(clean_name) not between 2 and 120 or p_full_name ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME'; end if;
 if coalesce(p_phone,'') ~ '[[:cntrl:]]' or (clean_phone<>'' and (
  length(clean_phone)>30 or clean_phone !~ '^[+]?[0-9 ()-]+$' or length(regexp_replace(clean_phone,'[^0-9]','','g'))<7
 )) then raise exception 'INVALID_PHONE'; end if;
 if coalesce(p_delivery_address,'') ~ '[[:cntrl:]]' or (clean_address<>'' and length(clean_address) not between 5 and 500) then raise exception 'INVALID_ADDRESS'; end if;
 if p_delivery_zone_id is not null then
  perform 1 from public.delivery_zones where id=p_delivery_zone_id and active for share;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
 end if;
 insert into public.customer_profiles as saved(user_id,full_name,phone,delivery_address,delivery_zone_id,completed_at)
  values(actor_id,clean_name,clean_phone,clean_address,p_delivery_zone_id,now())
 on conflict(user_id) do update set
  full_name=excluded.full_name,phone=excluded.phone,delivery_address=excluded.delivery_address,
  delivery_zone_id=excluded.delivery_zone_id,completed_at=coalesce(saved.completed_at,now()),
  skipped_at=null,updated_at=now()
 returning * into profile;
 return to_jsonb(profile);
end $$;

create function public.skip_customer_onboarding() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := auth.uid(); profile public.customer_profiles;
begin
 if actor_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
 insert into public.customer_profiles as saved(user_id,skipped_at) values(actor_id,now())
 on conflict(user_id) do update set skipped_at=now(),updated_at=now() where saved.completed_at is null
 returning * into profile;
 -- Skipping a completed profile is a no-op, including its timestamps and details.
 if not found then select * into profile from public.customer_profiles where user_id=actor_id; end if;
 return to_jsonb(profile);
end $$;
revoke all on function public.save_customer_profile(text,text,text,uuid),public.skip_customer_onboarding() from public,anon,authenticated;
grant execute on function public.save_customer_profile(text,text,text,uuid),public.skip_customer_onboarding() to authenticated;
