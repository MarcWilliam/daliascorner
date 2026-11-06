import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002";
const skipped = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customer}');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && !skipped.has(f))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand) values('finance-pot','Finance pot','اختبار',100,10);select set_product_unit_cost('finance-pot',30);`,
  );
  const key = crypto.randomUUID();
  await db.query(
    `select create_store_order($1,'finance-test','{"name":"TEST finance","phone":"01000000000","address":"Synthetic address"}','[{"id":"finance-pot","qty":2}]','en')`,
    [key],
  );
  const id = (
    await db.query<{ id: string }>(
      `update orders set delivery_fee=20,ordered_at=now()-interval '5 days' where idempotency_key=$1 returning id`,
      [key],
    )
  ).rows[0].id;
  const item = (
    await db.query<{ id: number }>(
      "select id from order_items where order_id=$1",
      [id],
    )
  ).rows[0].id;
  const day = (
    await db.query<{ v: string }>(
      "select (now() at time zone 'Africa/Cairo')::date::text v",
    )
  ).rows[0].v;
  return { db, id, item, day };
}
async function revision(db: PGlite, id: string) {
  return (
    await db.query<{ v: number }>(
      "select revision::int v from orders where id=$1",
      [id],
    )
  ).rows[0].v;
}
async function action(
  db: PGlite,
  id: string,
  name: string,
  payload: Record<string, unknown>,
  key = crypto.randomUUID(),
  rev?: number,
) {
  return (
    await db.query<{ v: unknown }>(
      "select admin_order_action($1,$2,$3,$4,$5::jsonb,$6) v",
      [
        id,
        rev ?? (await revision(db, id)),
        key,
        name,
        JSON.stringify(payload),
        "TEST admin adjustment",
      ],
    )
  ).rows[0].v;
}
async function overview(
  db: PGlite,
  from: string | null = null,
  to: string | null = null,
) {
  return (
    await db.query<{ v: Record<string, number> }>(
      "select finance_overview($1,$2) v",
      [from, to],
    )
  ).rows[0].v;
}
async function order(db: PGlite, id: string) {
  const row = (
    await db.query<{
      amount_received: number;
      amount_refunded: number;
      balance_due: number;
      refund_due: number;
      payment_state: string;
      payment_status: string;
    }>("select * from orders where id=$1", [id])
  ).rows[0];
  return {
    ...row,
    amount_received: Number(row.amount_received),
    amount_refunded: Number(row.amount_refunded),
    balance_due: Number(row.balance_due),
    refund_due: Number(row.refund_due),
  };
}
test("partial receipts/refunds are real amounts, retry once and never fabricate cash from fulfillment", async () => {
  const { db, id, item, day } = await setup();
  try {
    const key = crypto.randomUUID(),
      rev = await revision(db, id);
    await action(
      db,
      id,
      "payment",
      { amount: 50, date: day, reference: "deposit" },
      key,
      rev,
    );
    await action(
      db,
      id,
      "payment",
      { amount: 50, date: day, reference: "deposit" },
      key,
      rev,
    );
    assert.equal((await order(db, id)).amount_received, 50);
    assert.equal((await order(db, id)).balance_due, 170);
    assert.equal((await order(db, id)).payment_state, "partial");
    assert.equal((await overview(db)).known_product_cost, 0);
    await action(db, id, "confirm", {});
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 1 }],
      dispatched_on: day,
      courier: "TEST",
      tracking_number: "TEST-1",
    });
    assert.equal((await overview(db)).known_product_cost, 30);
    assert.equal((await order(db, id)).amount_received, 50);
    assert.equal(
      (
        await db.query<{ v: number }>(
          "select reserved::int v from inventory where product_id='finance-pot'",
        )
      ).rows[0].v,
      0,
    );
    await action(db, id, "refund", {
      amount: 10,
      date: day,
      reference: "partial refund",
    });
    assert.equal((await order(db, id)).amount_refunded, 10);
    assert.equal((await overview(db)).net_collected, 40);
    assert.equal((await overview(db)).known_product_cost, 30);
    await assert.rejects(
      action(db, id, "refund", { amount: 41, date: day }),
      /REFUND_EXCEEDS_RECEIPTS/,
    );
    await assert.rejects(
      action(db, id, "payment", { amount: "NaN", date: day }),
      /INVALID_AMOUNT/,
    );
    await assert.rejects(
      action(
        db,
        id,
        "payment",
        { amount: 1, date: day },
        crypto.randomUUID(),
        rev,
      ),
      /ORDER_CHANGED/,
    );
  } finally {
    await db.close();
  }
});
test("returns reverse shipped costs only when restocked and totals changes expose refund due", async () => {
  const { db, id, item, day } = await setup();
  try {
    await action(db, id, "payment", { amount: 220, date: day });
    await action(db, id, "confirm", {});
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 2 }],
      dispatched_on: day,
      courier: "TEST",
      tracking_number: "TEST-2",
    });
    assert.equal((await overview(db)).known_product_cost, 60);
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 1, restock: false }],
      returned_on: day,
    });
    assert.equal((await overview(db)).known_product_cost, 60);
    assert.equal((await order(db, id)).refund_due, 100);
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 1, restock: true }],
      returned_on: day,
    });
    assert.equal((await overview(db)).known_product_cost, 30);
    assert.equal((await order(db, id)).refund_due, 200);
    await action(db, id, "waive_delivery", {});
    assert.equal((await order(db, id)).refund_due, 220);
    await action(db, id, "refund", { amount: 220, date: day });
    assert.equal((await overview(db)).net_collected, 0);
    assert.equal((await overview(db)).known_product_cost, 30);
    assert.equal((await order(db, id)).payment_state, "refunded");
  } finally {
    await db.close();
  }
});
test("payment date corrections retain original receipt, shift period totals and remain private", async () => {
  const { db, id, day } = await setup();
  try {
    await action(db, id, "payment", { amount: 100, date: day });
    const event = (
      await db.query<{ id: number; occurred_at: string }>(
        "select id,occurred_at from finance_payment_events where order_id=$1",
        [id],
      )
    ).rows[0];
    const earlier = (
      await db.query<{ v: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-1)::text v",
      )
    ).rows[0].v;
    await action(db, id, "payment_date", { event_id: event.id, date: earlier });
    assert.equal((await overview(db, day, day)).net_collected, 0);
    assert.equal((await overview(db, earlier, earlier)).net_collected, 100);
    assert.equal(
      new Date(
        (
          await db.query<{ v: string }>(
            "select occurred_at v from finance_payment_events where id=$1",
            [event.id],
          )
        ).rows[0].v,
      ).getTime(),
      new Date(event.occurred_at).getTime(),
    );
    await assert.rejects(
      db.query("update finance_payment_events set amount=1 where id=$1", [
        event.id,
      ]),
      /FINANCE_HISTORY_IMMUTABLE/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      customer,
    ]);
    await db.exec("set role authenticated");
    await assert.rejects(
      action(
        db,
        id,
        "payment",
        { amount: 1, date: day },
        crypto.randomUUID(),
        0,
      ),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.query("select * from private.order_cost_events"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.order_finance_detail($1)", [id]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("cash corrections cannot create a refund before its underlying receipt and managed flags cannot bypass cash", async () => {
  const { db, id, day } = await setup();
  try {
    await action(db, id, "payment", { amount: 100, date: day });
    const earlier = (
      await db.query<{ v: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-1)::text v",
      )
    ).rows[0].v;
    await assert.rejects(
      action(db, id, "refund", { amount: 10, date: earlier }),
      /INVALID_PAYMENT_SEQUENCE/,
    );
    assert.equal((await order(db, id)).amount_refunded, 0);
    await action(db, id, "refund", { amount: 10, date: day });
    const event = (
      await db.query<{ id: number }>(
        "select id from finance_payment_events where order_id=$1 and event_type='refund'",
        [id],
      )
    ).rows[0];
    await assert.rejects(
      action(db, id, "payment_date", { event_id: event.id, date: earlier }),
      /INVALID_PAYMENT_SEQUENCE/,
    );
    await assert.rejects(
      db.query("select set_order_payment($1,'paid')", [id]),
      /USE_ORDER_ACTION/,
    );
    await assert.rejects(overview(db, "infinity", null), /INVALID_DATE_RANGE/);
    assert.equal((await order(db, id)).amount_received, 100);
    assert.equal((await order(db, id)).amount_refunded, 10);
  } finally {
    await db.close();
  }
});

test("legacy promotion adjustments use the promotion date separately from a backdated shipment", async () => {
  const { db, id, item, day } = await setup();
  try {
    await db.query("select set_order_payment($1,'paid')", [id]);
    const oldDay = (
      await db.query<{ v: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-3)::text v",
      )
    ).rows[0].v;
    const shipDay = (
      await db.query<{ v: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-1)::text v",
      )
    ).rows[0].v;
    await db.query(
      "update finance_payment_events set occurred_at=($2::date+time '12:00') at time zone 'Africa/Cairo' where order_id=$1",
      [id, oldDay],
    );
    await db.query("select transition_order($1,'confirmed')", [id]);
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 1 }],
      dispatched_on: shipDay,
      courier: "TEST",
    });
    assert.equal((await overview(db, oldDay, oldDay)).known_product_cost, 60);
    assert.equal((await overview(db, shipDay, shipDay)).known_product_cost, 30);
    assert.equal((await overview(db, day, day)).known_product_cost, -60);
    assert.equal((await overview(db)).known_product_cost, 30);
    assert.equal((await overview(db)).net_collected, 220);
  } finally {
    await db.close();
  }
});

test("migration refuses refunded legacy orders with no recorded cash history", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
    );
    const files = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && !skipped.has(f))
      .sort();
    const target = files.find((f) => f.endsWith("_order_adjustment_workflows.sql"))!;
    for (const file of files.filter((f) => f < target))
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.exec(
      `insert into orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale,subtotal,delivery_fee,payment_status) values(gen_random_uuid(),'unknown-refund','TEST legacy','01000000000','Synthetic old address','en',100,20,'refunded');`,
    );
    await assert.rejects(
      db.exec(readFileSync("supabase/migrations/" + target, "utf8")),
      /RECONCILE_LEGACY_REFUNDS_BEFORE_OPERATIONS/,
    );
    assert.equal(
      (
        await db.query<{ v: string }>(
          "select payment_status v from orders where request_hash='unknown-refund'",
        )
      ).rows[0].v,
      "refunded",
    );
    assert.equal(
      (
        await db.query<{ v: number }>(
          "select count(*)::int v from finance_payment_events",
        )
      ).rows[0].v,
      0,
    );
    assert.equal(
      (
        await db.query<{ v: number }>(
          "select count(*)::int v from information_schema.columns where table_schema='public' and table_name='orders' and column_name='payment_state'",
        )
      ).rows[0].v,
      0,
    );
  } finally {
    await db.close();
  }
});
