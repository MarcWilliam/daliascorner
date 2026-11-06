import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001";
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}');`,
  );
  for (const name of [
    "20261106080211_store.sql",
    "20261106092940_website_orders_accounts.sql",
    "20261106105238_website_retry_ownership.sql",
    "20261106115543_unlimited_inventory.sql",
    "20261106115558_admin_finance_tracking.sql",
    "20261106121718_rearm_unsent_meta_purchase.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale,subtotal,delivery_fee,guest_token_hash,marketing_consent) values(gen_random_uuid(),'test','TEST','01000000000','TEST address','en',200,50,'synthetic-token-hash',true);`,
  );
  return db;
}
async function payment(db: PGlite, value: string) {
  await db.query("select set_order_payment(id,$1) from orders", [value]);
}
type QueueRow = {
  id: string;
  attempts: number;
  event_time: Date;
  locked_until: Date | null;
  lease_token: string | null;
  sent_at: Date | null;
};
async function purchase(db: PGlite) {
  return (
    await db.query<QueueRow>(
      "select id,attempts,event_time,locked_until,lease_token,sent_at from meta_events where event_name='Purchase'",
    )
  ).rows[0];
}
test("a genuine repayment rearms an unsent Purchase stopped after a correction or refund", async () => {
  for (const reversal of ["unpaid", "refunded"]) {
    const db = await setup();
    try {
      await payment(db, "paid");
      const initial = await purchase(db);
      await payment(db, reversal);
      await db.exec(
        "update meta_events set attempts=8,event_time='2026-01-01',locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid() where event_name='Purchase'",
      );
      await payment(db, "paid");
      const rearmed = await purchase(db);
      assert.equal(rearmed.id, initial.id);
      assert.equal(rearmed.attempts, 0);
      assert.equal(rearmed.locked_until, null);
      assert.equal(rearmed.lease_token, null);
      assert.equal(rearmed.sent_at, null);
      assert.ok(new Date(rearmed.event_time) > new Date("2026-01-01"));
      const totals = (
        await db.query<{ amount: string; factor: number }>(
          "select sum(amount)::text amount,sum(cost_factor)::int factor from finance_payment_events",
        )
      ).rows[0];
      assert.equal(totals.amount, "250.00");
      assert.equal(totals.factor, 1);
    } finally {
      await db.close();
    }
  }
});
test("an already-sent Purchase is never rearmed or duplicated by repayment", async () => {
  const db = await setup();
  try {
    await payment(db, "paid");
    await db.exec(
      "update meta_events set sent_at=now()-interval '1 hour',event_time='2026-01-01',attempts=3,locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid()",
    );
    const sent = await purchase(db);
    await payment(db, "unpaid");
    await payment(db, "paid");
    assert.deepEqual(await purchase(db), sent);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from meta_events where event_name='Purchase'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
