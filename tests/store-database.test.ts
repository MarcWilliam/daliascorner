import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001";
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated,service_role; insert into auth.users values('${admin}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/20261106080211_store.sql", "utf8"),
  );
  await db.exec(
    `insert into public.admin_users values('${admin}'); insert into public.inventory(product_id,name_en,name_ar,price,on_hand) values('test-pot','Test','اختبار',100,5);`,
  );
  return db;
}
const customer = {
  name: "Test customer",
  phone: "01000000000",
  address: "Test address only",
};
async function order(
  db: PGlite,
  key = crypto.randomUUID(),
  qty = 2,
  hash = "same",
) {
  const { rows } = await db.query<{
    result: { order_number: number; subtotal: number };
  }>(
    `select public.create_store_order($1,$2,$3::jsonb,$4::jsonb,'en') as result`,
    [
      key,
      hash,
      JSON.stringify(customer),
      JSON.stringify([{ id: "test-pot", qty }]),
    ],
  );
  return rows[0].result;
}
test("order is atomic, priced by server, and retries reserve once", async () => {
  const db = await setup();
  try {
    const key = crypto.randomUUID();
    const a = await order(db, key);
    const b = await order(db, key);
    assert.equal(a.subtotal, 200);
    assert.equal(a.order_number, b.order_number);
    assert.deepEqual(
      (await db.query("select reserved,on_hand from inventory")).rows,
      [{ reserved: 2, on_hand: 5 }],
    );
    await assert.rejects(order(db, key, 3, "changed"), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(order(db, crypto.randomUUID(), 4), /OUT_OF_STOCK/);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from orders",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
test("cancellation releases reservations once; shipping consumes stock once", async () => {
  const db = await setup();
  try {
    await order(db);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    await db.exec(
      `select transition_order(id,'cancelled') from orders; select transition_order(id,'cancelled') from orders;`,
    );
    assert.deepEqual(
      (await db.query("select reserved,on_hand from inventory")).rows,
      [{ reserved: 0, on_hand: 5 }],
    );
    await order(db);
    await db.exec(
      `select transition_order(id,'confirmed') from orders where status='pending'; select transition_order(id,'shipped') from orders where status='confirmed'; select transition_order(id,'shipped') from orders where status='shipped';`,
    );
    assert.deepEqual(
      (await db.query("select reserved,on_hand from inventory")).rows,
      [{ reserved: 0, on_hand: 3 }],
    );
    await assert.rejects(
      db.exec(
        `select transition_order(id,'cancelled') from orders where status='shipped';`,
      ),
      /INVALID_TRANSITION/,
    );
  } finally {
    await db.close();
  }
});
test("expiry releases stock and manual adjustments cannot consume reserved stock", async () => {
  const db = await setup();
  try {
    await order(db);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    await assert.rejects(
      db.exec(`select adjust_stock('test-pot',-4,'damaged');`),
      /STOCK_BELOW_RESERVED/,
    );
    await db.exec(
      `update orders set expires_at=now()-interval '1 hour'; select expire_pending_orders(); select expire_pending_orders();`,
    );
    assert.deepEqual(
      (await db.query("select reserved,on_hand from inventory")).rows,
      [{ reserved: 0, on_hand: 5 }],
    );
    assert.equal(
      (await db.query<{ status: string }>("select status from orders")).rows[0]
        .status,
      "expired",
    );
  } finally {
    await db.close();
  }
});
test("public cannot read orders or mutate stock; non-admin login has no access", async () => {
  const db = await setup();
  try {
    await order(db);
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from store_availability()")).rows.length,
      1,
    );
    await assert.rejects(db.query("select * from orders"), /permission denied/);
    await assert.rejects(order(db), /permission denied/);
    await db.exec("reset role; set role authenticated");
    assert.equal((await db.query("select * from orders")).rows.length, 0);
    await assert.rejects(
      db.exec(`select adjust_stock('test-pot',1,'test');`),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.exec(`update inventory set on_hand=999;`),
      /permission denied/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    assert.equal((await db.query("select * from orders")).rows.length, 1);
    await db.exec(`select adjust_stock('test-pot',1,'restocked');`);
  } finally {
    await db.close();
  }
});
test("notification leases avoid concurrent claims and RLS cannot self-promote", async () => {
  const db = await setup();
  try {
    await order(db);
    const first = await db.query("select * from claim_notifications()");
    assert.ok(first.rows.length > 0);
    assert.equal(
      (await db.query("select * from claim_notifications()")).rows.length,
      0,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.exec(
        `insert into admin_users values('00000000-0000-4000-8000-000000000002');`,
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(`select * from claim_notifications();`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
