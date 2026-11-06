import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { FinanceOverview } from "../lib/store/finance-copy";

const admin = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const customer = {
  name: "Workflow TEST",
  phone: "01000000000",
  address: "Disposable local test address",
};

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    insert into auth.users(id) values('${admin}'),('${customerId}');
  `);
  // Exercise the complete application schema, including later contract fixes.
  // PGlite cannot run hosted pg_cron/pg_net/Vault jobs; dispatch delivery is tested separately.
  const hostedSchedules = new Set([
    "20261106080241_expiry.sql",
    "20261106083056_notification_cron.sql",
    "20261106092948_meta_dispatch_schedule.sql",
  ]);
  for (const migration of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql") && !hostedSchedules.has(name))
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  }
  await db.exec(`
    insert into admin_users values('${admin}');
    select set_config('request.jwt.claim.sub','${admin}',false);
    insert into inventory(product_id,name_en,name_ar,price,on_hand,unlimited_stock)
      values('finite','Finite TEST','محدود',100,5,false),('unlimited','Unlimited TEST','غير محدود',200,0,true);
    select set_product_unit_cost('finite',30); select set_product_unit_cost('unlimited',50);
  `);
  const zone = crypto.randomUUID();
  await db.query(
    "insert into delivery_zones(id,name_en,name_ar,fee) values($1,'TEST zone','اختبار',60)",
    [zone],
  );
  return { db, zone };
}

type Receipt = {
  order_number: number;
  total: number;
  delivery_fee: number;
  status: string;
  payment_status: string;
  expires_at: string;
};
function attempt(
  zone: string,
  lines = [
    { id: "finite", qty: 2 },
    { id: "unlimited", qty: 3 },
  ],
) {
  return { key: crypto.randomUUID(), token: crypto.randomUUID(), zone, lines };
}
async function submit(
  db: PGlite,
  a: ReturnType<typeof attempt>,
  owner: string | null = null,
) {
  const result = (
    await db.query<{ result: Receipt }>(
      "select create_website_order($1,'workflow-hash',$2::jsonb,$3::jsonb,'en',$4,$5,'cash',$6,true) result",
      [
        a.key,
        JSON.stringify(customer),
        JSON.stringify(a.lines),
        a.token,
        a.zone,
        owner,
      ],
    )
  ).rows[0].result;
  const id = (
    await db.query<{ id: string }>(
      "select id from orders where idempotency_key=$1",
      [a.key],
    )
  ).rows[0].id;
  return { id, result };
}
async function stock(db: PGlite) {
  return (
    await db.query(
      "select product_id,on_hand,reserved from inventory where product_id in ('finite','unlimited') order by product_id",
    )
  ).rows;
}
async function totals(db: PGlite) {
  return (
    await db.query<{ result: FinanceOverview }>(
      "select finance_overview() result",
    )
  ).rows[0].result;
}
async function transition(db: PGlite, id: string, status: string) {
  await db.query("select transition_order($1,$2)", [id, status]);
}
async function pay(db: PGlite, id: string, status = "paid") {
  await db.query("select set_order_payment($1,$2)", [id, status]);
}

test("website order integrates inventory, account ownership, costs, payments and notification leases", async () => {
  const { db, zone } = await setup();
  try {
    const a = attempt(zone);
    const { id, result } = await submit(db, a);
    assert.equal(result.total, 860); // 2 × 100 + 3 × 200 + delivery 60
    assert.equal(result.payment_status, "unpaid");
    assert.deepEqual(await stock(db), [
      { product_id: "finite", on_hand: 5, reserved: 2 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ]);
    assert.deepEqual(
      (
        await db.query(
          "select kind,count(*)::int count from admin_notifications group by kind order by kind",
        )
      ).rows,
      [
        { kind: "low_stock", count: 1 },
        { kind: "order", count: 1 },
      ],
    );
    assert.equal((await totals(db)).net_collected, 0);

    // Later catalog, delivery and cost edits must not rewrite this accepted order.
    await db.exec(
      "update inventory set price=price+50 where product_id in ('finite','unlimited')",
    );
    await db.query("update delivery_zones set fee=99 where id=$1", [zone]);
    await db.exec(
      "select set_product_unit_cost('finite',70); select set_product_unit_cost('unlimited',90)",
    );
    assert.equal((await submit(db, a)).result.total, 860);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from orders",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from admin_notifications",
        )
      ).rows[0].count,
      2,
    );

    // Attaching a guest receipt preserves the order while making it owner-only.
    await db.exec(
      `select set_config('request.jwt.claim.sub','${customerId}',false)`,
    );
    await db.query("select claim_order($1)", [a.token]);
    assert.equal(
      (
        await db.query<{ result: unknown }>("select guest_order($1) result", [
          a.token,
        ])
      ).rows[0].result,
      null,
    );
    await assert.rejects(submit(db, a), /ORDER_NOT_AVAILABLE/);
    assert.equal((await submit(db, a, customerId)).id, id);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false)`,
    );

    // Overlapping workers cannot claim the same queue records; stale acknowledgements fail.
    const leased = (
      await db.query<{ id: number; lease_token: string }>(
        "select * from claim_notifications()",
      )
    ).rows;
    assert.equal(leased.length, 2);
    assert.equal(
      (await db.query("select * from claim_notifications()")).rows.length,
      0,
    );
    const staleAck = await db.query(
      "update admin_notifications set sent_at=now() where id=$1 and lease_token=$2 returning id",
      [leased[0].id, crypto.randomUUID()],
    );
    assert.equal(staleAck.rows.length, 0);
    for (const event of leased)
      await db.query(
        "update admin_notifications set sent_at=now(),locked_until=null where id=$1 and lease_token=$2",
        [event.id, event.lease_token],
      );

    await pay(db, id);
    await pay(db, id); // Repeated admin save has no second financial receipt.
    let t = await totals(db);
    assert.equal(t.net_collected, 860);
    assert.equal(t.known_product_cost, 210); // Original 2 × 30 + 3 × 50 snapshots.
    assert.equal(t.gross_profit, 650);
    await db.query(
      "update orders set expires_at=now()-interval '1 minute' where id=$1",
      [id],
    );
    await db.exec("select expire_pending_orders()");
    const paidRetry = (await submit(db, a, customerId)).result;
    assert.equal(paidRetry.status, "pending");
    assert.equal(paidRetry.payment_status, "paid");
    assert.ok(Date.parse(paidRetry.expires_at) < Date.now());
    await transition(db, id, "confirmed");
    await transition(db, id, "shipped");
    await transition(db, id, "delivered");
    const afterDelivery = [
      { product_id: "finite", on_hand: 3, reserved: 0 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ];
    assert.deepEqual(await stock(db), afterDelivery);

    const expense = crypto.randomUUID();
    await db.query(
      "select add_finance_entry(current_date,'marketing',20,'Workflow TEST expense',$1)",
      [expense],
    );
    assert.equal((await totals(db)).operating_result, 630);
    // A corrected, unsent sale can be re-armed without a new Meta event identity.
    await pay(db, id, "unpaid");
    await db.query(
      "update meta_events set attempts=8,locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid() where order_id=$1 and event_name='Purchase'",
      [id],
    );
    await pay(db, id);
    assert.deepEqual(
      (
        await db.query(
          "select attempts,locked_until,lease_token from meta_events where order_id=$1 and event_name='Purchase'",
          [id],
        )
      ).rows,
      [{ attempts: 0, locked_until: null, lease_token: null }],
    );
    assert.equal((await totals(db)).known_product_cost, 210);
    await pay(db, id, "refunded");
    t = await totals(db);
    assert.equal(t.net_collected, 0);
    assert.equal(t.refunded, 860);
    assert.equal(t.known_product_cost, 210); // Refund does not imply goods were recovered.
    assert.equal(t.operating_result, -230);
    await db.query("select void_finance_entry($1)", [expense]);
    assert.equal((await totals(db)).cash_spent, 0);
    assert.deepEqual(await stock(db), afterDelivery); // Payment changes never restock shipped goods.

    // Unpaid alternative outcomes release finite holds without adding revenue.
    const cancel = await submit(
      db,
      attempt(zone, [
        { id: "finite", qty: 1 },
        { id: "unlimited", qty: 2 },
      ]),
    );
    await transition(db, cancel.id, "cancelled");
    const expire = await submit(
      db,
      attempt(zone, [
        { id: "finite", qty: 1 },
        { id: "unlimited", qty: 99 },
      ]),
    );
    await db.query(
      "update orders set expires_at=now()-interval '1 minute' where id=$1",
      [expire.id],
    );
    await db.exec(
      "select expire_pending_orders(); select expire_pending_orders()",
    );
    assert.deepEqual(await stock(db), afterDelivery);
    assert.equal((await totals(db)).net_collected, 0);
    assert.equal((await totals(db)).known_product_cost, 210);

    // A basket failure after its finite item was reserved rolls back every side effect.
    await db.exec("select set_inventory_active('unlimited',false)");
    const beforeFailure = (
      await db.query(
        "select (select count(*)::int from orders) orders,(select count(*)::int from order_items) items,(select count(*)::int from order_item_costs) costs,(select count(*)::int from stock_movements) movements,(select count(*)::int from admin_notifications) notifications",
      )
    ).rows;
    await assert.rejects(
      submit(
        db,
        attempt(zone, [
          { id: "finite", qty: 1 },
          { id: "unlimited", qty: 1 },
        ]),
      ),
      /OUT_OF_STOCK/,
    );
    assert.deepEqual(
      (
        await db.query(
          "select (select count(*)::int from orders) orders,(select count(*)::int from order_items) items,(select count(*)::int from order_item_costs) costs,(select count(*)::int from stock_movements) movements,(select count(*)::int from admin_notifications) notifications",
        )
      ).rows,
      beforeFailure,
    );
    assert.deepEqual(await stock(db), afterDelivery);
  } finally {
    await db.close();
  }
});
