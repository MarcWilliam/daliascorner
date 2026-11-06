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
  for (const migration of [
    "20261106080211_store.sql",
    "20261106092940_website_orders_accounts.sql",
    "20261106105238_website_retry_ownership.sql",
    "20261106115543_unlimited_inventory.sql",
    "20261106121715_return_order_payment_status.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');insert into inventory(product_id,name_en,name_ar,price,on_hand) values('pot','Pot','وعاء',100,5);select set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  return db;
}
async function order(db: PGlite, qty = 2) {
  const key = crypto.randomUUID();
  await db.query(
    `select create_store_order($1,'hash','{"name":"Test customer","phone":"01000000000","address":"Test address"}'::jsonb,$2::jsonb,'en')`,
    [key, JSON.stringify([{ id: "pot", qty }])],
  );
  return (
    await db.query<{ id: string }>(
      "select id from orders where idempotency_key=$1",
      [key],
    )
  ).rows[0].id;
}
async function counts(db: PGlite) {
  return (await db.query("select on_hand,reserved from inventory")).rows[0];
}
test("unlimited orders do not reserve or consume finite counts across mode switches", async () => {
  const db = await setup();
  try {
    await db.exec("select set_inventory_mode('pot',true)");
    assert.equal(
      (
        await db.query<{ available: number }>(
          "select available from store_availability()",
        )
      ).rows[0].available,
      2147483647,
    );
    const id = await order(db, 99);
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 0 });
    assert.equal(
      (
        await db.query<{ stock_tracked: boolean }>(
          "select stock_tracked from order_items",
        )
      ).rows[0].stock_tracked,
      false,
    );
    await db.exec("select set_inventory_mode('pot',false)");
    await db.query("select transition_order($1,'confirmed');", [id]);
    await db.query("select transition_order($1,'shipped')", [id]);
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 0 });
    assert.equal(
      (
        await db.query<{ available: number }>(
          "select available from store_availability()",
        )
      ).rows[0].available,
      5,
    );
  } finally {
    await db.close();
  }
});
test("finite reservations still release and ship after switching to unlimited", async () => {
  const db = await setup();
  try {
    const cancel = await order(db, 2);
    const ship = await order(db, 2);
    await db.exec("select set_inventory_mode('pot',true)");
    await db.query("select transition_order($1,'cancelled')", [cancel]);
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 2 });
    await db.query("select transition_order($1,'confirmed')", [ship]);
    await db.query("select transition_order($1,'shipped')", [ship]);
    assert.deepEqual(await counts(db), { on_hand: 3, reserved: 0 });
  } finally {
    await db.close();
  }
});
test("expiry releases tracked holds only and keeps paid orders reserved", async () => {
  const db = await setup();
  try {
    const finite = await order(db, 2);
    const paid = await order(db, 2);
    await db.exec("select set_inventory_mode('pot',true)");
    const unlimited = await order(db, 99);
    await db.query("update orders set payment_status='paid' where id=$1", [
      paid,
    ]);
    await db.exec(
      "update orders set expires_at=now()-interval '1 minute'; select expire_pending_orders()",
    );
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 2 });
    const statuses = (
      await db.query<{ id: string; status: string }>(
        "select id,status from orders",
      )
    ).rows;
    assert.equal(statuses.find((o) => o.id === paid)?.status, "pending");
    assert.equal(statuses.find((o) => o.id === finite)?.status, "expired");
    assert.equal(statuses.find((o) => o.id === unlimited)?.status, "expired");
    await db.exec("select expire_pending_orders()");
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 2 });
    await db.query("select transition_order($1,'confirmed')", [paid]);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from orders where id=$1",
          [paid],
        )
      ).rows[0].status,
      "confirmed",
    );
  } finally {
    await db.close();
  }
});
test("stock actions use automatic reasons, preserve held stock, and require admin", async () => {
  const db = await setup();
  try {
    await order(db, 2);
    await db.exec("select restock_inventory('pot',3,'add')");
    assert.deepEqual(await counts(db), { on_hand: 8, reserved: 2 });
    await db.exec(
      "select restock_inventory('pot',1,'remove');select restock_inventory('pot',4,'set')",
    );
    assert.deepEqual(await counts(db), { on_hand: 4, reserved: 2 });
    await assert.rejects(
      db.exec("select restock_inventory('pot',1,'set')"),
      /STOCK_BELOW_RESERVED/,
    );
    await assert.rejects(
      db.exec("select restock_inventory('pot',0,'add')"),
      /INVALID_QUANTITY/,
    );
    const reasons = (
      await db.query<{ reason: string }>(
        "select reason from stock_movements order by id",
      )
    ).rows.map((r) => r.reason);
    assert.deepEqual(reasons, [
      "order_reserved",
      "restocked",
      "stock_removed",
      "stock_count_corrected",
    ]);
    await db.exec("select set_inventory_active('pot',false)");
    assert.equal(
      (
        await db.query<{ available: number }>(
          "select available from store_availability()",
        )
      ).rows[0].available,
      0,
    );
    await assert.rejects(order(db), /OUT_OF_STOCK/);
    await db.exec(
      "select set_config('request.jwt.claim.sub','',false);set role authenticated",
    );
    await assert.rejects(
      db.exec("select restock_inventory('pot',1,'add')"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec("select set_inventory_mode('pot',true)"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec("select set_inventory_active('pot',true)"),
      /FORBIDDEN/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.exec("select restock_inventory('pot',1,'add')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("unlimited products do not create low-stock notifications", async () => {
  const db = await setup();
  try {
    await db.exec(
      "select set_inventory_mode('pot',true);select restock_inventory('pot',1,'set')",
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from admin_notifications where kind='low_stock'",
        )
      ).rows[0].count,
      0,
    );
    await db.exec("select set_inventory_mode('pot',false)");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from admin_notifications where kind='low_stock'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("paid pending retries expose current payment state after expiry without duplicating stock or notifications", async () => {
  const db = await setup();
  try {
    const key = crypto.randomUUID();
    const args = [
      key,
      "hash",
      JSON.stringify({
        name: "Test customer",
        phone: "01000000000",
        address: "Test address",
      }),
      JSON.stringify([{ id: "pot", qty: 2 }]),
    ];
    const create = async () =>
      (
        await db.query<{
          result: {
            payment_status: string;
            status: string;
            expires_at: string;
          };
        }>(
          "select create_store_order($1,$2,$3::jsonb,$4::jsonb,'en') result",
          args,
        )
      ).rows[0].result;
    assert.equal((await create()).payment_status, "unpaid");
    await db.query(
      "select set_order_payment(id,'paid') from orders where idempotency_key=$1",
      [key],
    );
    await db.query(
      "update orders set expires_at=now()-interval '1 minute' where idempotency_key=$1",
      [key],
    );
    await db.exec("select expire_pending_orders()");
    const retried = await create();
    assert.equal(retried.status, "pending");
    assert.equal(retried.payment_status, "paid");
    assert.ok(Date.parse(retried.expires_at) < Date.now());
    assert.deepEqual(await counts(db), { on_hand: 5, reserved: 2 });
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from admin_notifications where kind='order'",
        )
      ).rows[0].count,
      1,
    );
    await db.exec("select transition_order(id,'confirmed') from orders");
    assert.equal(
      (await db.query<{ status: string }>("select status from orders")).rows[0]
        .status,
      "confirmed",
    );
  } finally {
    await db.close();
  }
});
