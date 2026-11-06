-- Backend-only, shared counters: no browser access and no raw IP/phone retention.
create table private.checkout_rate_limits (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 hits integer not null check(hits>0),
 expires_at timestamptz not null
);
alter table private.checkout_rate_limits enable row level security;
revoke all on private.checkout_rate_limits from public,anon,authenticated;
create index checkout_rate_limits_expiry_idx on private.checkout_rate_limits(expires_at);

create function public.consume_checkout_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare accepted_count integer; checked_at timestamptz:=clock_timestamp();
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 1000
    or p_seconds is null or p_seconds not between 60 and 86400 then raise exception 'INVALID_RATE_LIMIT'; end if;
 -- Expired rows are retained at most another day, without requiring a paid scheduler.
 delete from private.checkout_rate_limits where expires_at<checked_at-interval '24 hours';
 insert into private.checkout_rate_limits(key_hash,hits,expires_at)
 values(p_key,1,checked_at+make_interval(secs=>p_seconds))
 on conflict(key_hash) do update set
  hits=case when checkout_rate_limits.expires_at<=checked_at then 1 else least(checkout_rate_limits.hits+1,p_limit+1) end,
  expires_at=case when checkout_rate_limits.expires_at<=checked_at then checked_at+make_interval(secs=>p_seconds) else checkout_rate_limits.expires_at end
 returning hits into accepted_count;
 return accepted_count<=p_limit;
end $$;
revoke all on function public.consume_checkout_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_checkout_limit(text,integer,integer) to service_role;
