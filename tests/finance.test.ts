import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001";
async function setup(legacy = false) {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now()); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; insert into auth.users(id) values('${admin}');`,
  );
  for (const name of [
    "20261106080211_store.sql",
    "20261106092940_website_orders_accounts.sql",
    "20261106105238_website_retry_ownership.sql",
    "20261106115543_unlimited_inventory.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}'); insert into inventory(product_id,name_en,name_ar,price,on_hand) values('pot','Pot','وعاء',100,99); select set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  if (legacy) {
    const id = await order(db);
    await db.query("update orders set payment_status='paid' where id=$1", [id]);
  }
  await db.exec(
    readFileSync(
      "supabase/migrations/20261106115558_admin_finance_tracking.sql",
      "utf8",
    ),
  );
  return db;
}
async function order(db: PGlite) {
  const key = crypto.randomUUID();
  await db.query(
    `select create_store_order($1,'hash','{"name":"Customer","phone":"01000000000","address":"Test address"}'::jsonb,'[{"id":"pot","qty":2}]'::jsonb,'en')`,
    [key],
  );
  const id = (
    await db.query<{ id: string }>(
      "select id from orders where idempotency_key=$1",
      [key],
    )
  ).rows[0].id;
  await db.query("update orders set delivery_fee=50 where id=$1", [id]);
  return id;
}
type Totals = Record<string, number | null>;
async function overview(
  db: PGlite,
  from: string | null = null,
  to: string | null = null,
) {
  return (
    await db.query<{ value: Totals }>(
      "select finance_overview($1,$2) as value",
      [from, to],
    )
  ).rows[0].value;
}
async function paid(db: PGlite, id: string, status = "paid") {
  await db.query("select set_order_payment($1,$2)", [id, status]);
}

test("paid-order estimates separate product cost, inventory cash purchases, and operating spending", async () => {
  const db = await setup();
  try {
    await db.exec("select set_product_unit_cost('pot',30)");
    const id = await order(db);
    await db.exec("select set_product_unit_cost('pot',80)");
    await paid(db, id);
    await paid(db, id);
    await db.exec(
      "select add_finance_entry(current_date,'inventory',300,'Stock purchase'); select add_finance_entry(current_date,'marketing',20,'')",
    );
    const t = await overview(db);
    assert.equal(t.collected, 250);
    assert.equal(t.delivery_collected, 50);
    assert.equal(t.known_product_cost, 60);
    assert.equal(t.cash_spent, 320);
    assert.equal(t.cash_balance, -70);
    assert.equal(t.gross_profit, 190);
    assert.equal(t.operating_result, 170);
    assert.equal(t.operating_margin, 68);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from finance_payment_events",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
test("unknown costs block margin and can be completed once without rewriting known snapshots", async () => {
  const db = await setup();
  try {
    const id = await order(db);
    await paid(db, id);
    let t = await overview(db);
    assert.equal(t.missing_cost_items, 1);
    assert.equal(t.operating_result, null);
    assert.equal(t.gross_margin, null);
    const item = (await db.query<{ id: number }>("select id from order_items"))
      .rows[0].id;
    await db.query("select set_order_item_cost($1,40)", [item]);
    t = await overview(db);
    assert.equal(t.gross_profit, 170);
    assert.equal(t.missing_cost_items, 0);
    await assert.rejects(
      db.query("select set_order_item_cost($1,50)", [item]),
      /COST_ALREADY_RECORDED/,
    );
    await assert.rejects(
      db.exec("select set_product_unit_cost('pot',-1)"),
      /INVALID_COST/,
    );
  } finally {
    await db.close();
  }
});
test("refunds reduce receipts in their Cairo date period and retain paid-order costs", async () => {
  const db = await setup();
  try {
    await db.exec("select set_product_unit_cost('pot',30)");
    const id = await order(db);
    await paid(db, id);
    await db.exec(
      "update finance_payment_events set occurred_at='2026-11-01T22:30:00Z'",
    ); // Cairo Nov 2
    await paid(db, id, "refunded");
    await db.exec(
      "update finance_payment_events set occurred_at='2026-11-04T10:00:00Z' where event_type='refund'",
    );
    let t = await overview(db, "2026-11-01", "2026-11-01");
    assert.equal(t.collected, 0);
    t = await overview(db, "2026-11-02", "2026-11-02");
    assert.equal(t.net_collected, 250);
    assert.equal(t.known_product_cost, 60);
    t = await overview(db, "2026-11-04", "2026-11-04");
    assert.equal(t.refunded, 250);
    assert.equal(t.net_collected, -250);
    assert.equal(t.known_product_cost, 0);
    assert.equal(t.gross_profit, -250);
    assert.equal(t.gross_margin, null);
    t = await overview(db);
    assert.equal(t.net_collected, 0);
    assert.equal(t.known_product_cost, 60);
    assert.equal(t.gross_profit, -60);
  } finally {
    await db.close();
  }
});
test("payment corrections reverse cash and costs and re-payment does not multiply costs", async () => {
  const db = await setup();
  try {
    await db.exec("select set_product_unit_cost('pot',30)");
    const id = await order(db);
    await assert.rejects(
      paid(db, id, "refunded"),
      /REFUND_REQUIRES_PAID_ORDER/,
    );
    await paid(db, id);
    await paid(db, id, "unpaid");
    let t = await overview(db);
    assert.equal(t.net_collected, 0);
    assert.equal(t.known_product_cost, 0);
    assert.equal(t.corrections, 250);
    await paid(db, id);
    t = await overview(db);
    assert.equal(t.net_collected, 250);
    assert.equal(t.known_product_cost, 60);
  } finally {
    await db.close();
  }
});
test("voided expenses stop affecting totals; validation and role checks protect financial records", async () => {
  const db = await setup();
  try {
    const entry = (
      await db.query<{ id: string }>(
        "select add_finance_entry(current_date,'other',25,'') as id",
      )
    ).rows[0].id;
    await db.query("select void_finance_entry($1)", [entry]);
    assert.equal((await overview(db)).cash_spent, 0);
    await assert.rejects(
      db.query("select void_finance_entry($1)", [entry]),
      /ENTRY_NOT_AVAILABLE/,
    );
    await assert.rejects(
      db.exec("select add_finance_entry(current_date,'other',0,'')"),
      /INVALID_ENTRY/,
    );
    await assert.rejects(
      overview(db, "2026-11-03", "2026-11-02"),
      /INVALID_DATE_RANGE/,
    );
    await db.exec(
      "select set_config('request.jwt.claim.sub','',false); set role authenticated",
    );
    for (const table of [
      "product_costs",
      "order_item_costs",
      "finance_entries",
      "finance_payment_events",
    ])
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(overview(db), /FORBIDDEN/);
    await assert.rejects(
      db.exec("select add_finance_entry(current_date,'other',1,'')"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec("insert into product_costs values('pot',1,now())"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(overview(db), /permission denied/);
  } finally {
    await db.close();
  }
});
test("historical paid flags are undated opening balances and unknown historical costs", async () => {
  const db = await setup(true);
  try {
    let t = await overview(db);
    assert.equal(t.net_collected, 250);
    assert.equal(t.opening_paid_orders, 1);
    assert.equal(t.missing_cost_items, 1);
    t = await overview(db, "2020-01-01", "2099-12-31");
    assert.equal(t.net_collected, 0);
    assert.equal(t.opening_paid_amount, 250);
  } finally {
    await db.close();
  }
});
test("expense retries are idempotent and changed contents cannot reuse an identifier", async () => {
  const db = await setup();
  try {
    const id = crypto.randomUUID();
    await db.query(
      "select add_finance_entry(current_date,'other',25,'Invoice',$1)",
      [id],
    );
    await db.query(
      "select add_finance_entry(current_date,'other',25,'Invoice',$1)",
      [id],
    );
    assert.equal((await overview(db)).cash_spent, 25);
    await assert.rejects(
      db.query(
        "select add_finance_entry(current_date,'other',50,'Invoice',$1)",
        [id],
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      db.exec(
        "select add_finance_entry((now() at time zone 'Africa/Cairo')::date+1,'other',25,'')",
      ),
      /INVALID_ENTRY/,
    );
  } finally {
    await db.close();
  }
});

test("a signed-in customer can read their order items but cannot read or mutate product costs", async () => {
  const db = await setup();
  try {
    const customer = "00000000-0000-4000-8000-000000000002";
    await db.exec("select set_product_unit_cost('pot',30)");
    const id = await order(db);
    await paid(db, id);
    await db.query("insert into auth.users(id) values($1)", [customer]);
    await db.query("update orders set customer_id=$1 where id=$2", [
      customer,
      id,
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      customer,
    ]);
    await db.exec("set role authenticated");
    const items = (
      await db.query<{ item: Record<string, unknown> }>(
        "select to_jsonb(i) item from order_items i",
      )
    ).rows;
    assert.equal(items.length, 1);
    assert.equal("unit_cost" in items[0].item, false);
    for (const table of [
      "product_costs",
      "order_item_costs",
      "finance_entries",
      "finance_payment_events",
    ])
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(
      db.exec("select set_product_unit_cost('pot',1)"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec("select set_order_item_cost(1,1)"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec("select finance_missing_costs()"),
      /FORBIDDEN/,
    );
  } finally {
    await db.close();
  }
});
