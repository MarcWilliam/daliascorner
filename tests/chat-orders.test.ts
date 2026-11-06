import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const admin = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const secondAdmin = "00000000-0000-4000-8000-000000000003";
const customer = {
  name: "Chat TEST",
  phone: "+20 (100) 000-0000",
  address: "Disposable chat test address",
};
const schedules = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customerId}'),('${secondAdmin}');`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql") && !schedules.has(name))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}'),('${secondAdmin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand,unlimited_stock) values('finite','Finite TEST','محدود',100,5,false),('unlimited','Unlimited TEST','غير محدود',200,0,true);select set_product_unit_cost('finite',30);select set_product_unit_cost('unlimited',50);update checkout_settings set transfer_enabled=true,transfer_instructions='TEST transfer details',instapay_number='test-shop@instapay';`,
  );
  const zone = crypto.randomUUID();
  await db.query(
    "insert into delivery_zones(id,name_en,name_ar,fee) values($1,'TEST zone','منطقة اختبار',60)",
    [zone],
  );
  return { db, zone };
}
type Input = {
  key: string;
  token: string;
  customer: unknown;
  lines: unknown;
  locale: string;
  zone: string;
  payment: string;
  paid: boolean | null;
};
function input(zone: string, patch: Partial<Input> = {}): Input {
  return {
    key: crypto.randomUUID(),
    token: crypto.randomUUID(),
    customer,
    lines: [
      { id: "finite", qty: 2 },
      { id: "unlimited", qty: 3 },
    ],
    locale: "en",
    zone,
    payment: "cash",
    paid: false,
    ...patch,
  };
}
type Receipt = {
  id: string;
  order_number: number;
  source: string;
  status: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  items: { id: string; price: number; qty: number }[];
};
async function create(db: PGlite, a: Input) {
  return (
    await db.query<{ value: Receipt }>(
      "select create_chat_order($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8) value",
      [
        a.key,
        a.token,
        JSON.stringify(a.customer),
        JSON.stringify(a.lines),
        a.locale,
        a.zone,
        a.payment,
        a.paid,
      ],
    )
  ).rows[0].value;
}
async function stock(db: PGlite) {
  return (
    await db.query(
      "select product_id,on_hand,reserved from inventory where product_id in ('finite','unlimited') order by product_id",
    )
  ).rows;
}
async function counts(db: PGlite) {
  return (
    await db.query(
      "select (select count(*)::int from orders) orders,(select count(*)::int from order_items) items,(select count(*)::int from order_item_costs) costs,(select count(*)::int from stock_movements) movements,(select count(*)::int from admin_notifications) notices,(select count(*)::int from finance_payment_events) payments",
    )
  ).rows;
}

const cairoToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function managedDetail(db: PGlite, id: string): Promise<any> {
  return (await db.query<{ v: any }>("select admin_order_detail($1) v", [id]))
    .rows[0].v;
}
async function managedAction(
  db: PGlite,
  id: string,
  action: string,
  payload: unknown = {},
  key: string = crypto.randomUUID(),
  revision?: number,
) {
  const detail = await managedDetail(db, id);
  return db.query(
    "select admin_order_action($1,$2,$3,$4,$5::jsonb,'Workflow TEST action')",
    [
      id,
      revision ?? detail.order.revision,
      key,
      action,
      JSON.stringify(payload),
    ],
  );
}
async function managedShip(db: PGlite, id: string) {
  const d = await managedDetail(db, id);
  await managedAction(db, id, "ship", {
    lines: d.items
      .map((i: any) => ({
        item_id: i.id,
        quantity: i.quantity - i.removed_quantity - i.shipped_quantity,
      }))
      .filter((i: any) => i.quantity > 0),
    courier: "TEST carrier",
    tracking_number: "TEST reference",
    dispatched_on: cairoToday(),
    expected_on: null,
  });
}

test("admin chat order uses catalog/zone snapshots, finite/unlimited stock, private tracking and paid finance without Meta", async () => {
  const { db, zone } = await setup();
  try {
    const a = input(zone, {
      paid: true,
      payment: "transfer",
      locale: "ar",
      customer: { ...customer, name: "  Chat TEST  ", marketing_consent: true },
      lines: [
        { id: "unlimited", qty: 3, price: 1 },
        { id: "finite", qty: 2, price: 1 },
      ],
    });
    await db.exec("set role authenticated");
    const r = await create(db, a);
    assert.equal(r.source, "chat");
    assert.equal(r.status, "confirmed");
    assert.equal(r.payment_status, "paid");
    assert.equal(r.subtotal, 800);
    assert.equal(r.delivery_fee, 60);
    assert.equal(r.total, 860);
    assert.equal(r.payment_method, "transfer");
    await db.exec("reset role");
    const o = (
      await db.query<{
        source: string;
        recorded_by: string;
        marketing_consent: boolean;
        customer_name: string;
        customer_id: null;
        meta_context: unknown;
        delivery_zone: string;
        guest_token_hash: string;
        transfer_instructions: string;
      }>("select * from orders where id=$1", [r.id])
    ).rows[0];
    assert.equal(o.source, "chat");
    assert.equal(o.recorded_by, admin);
    assert.equal(o.marketing_consent, false);
    assert.deepEqual(o.meta_context, {});
    assert.equal(o.customer_name, "Chat TEST");
    assert.equal(o.customer_id, null);
    assert.equal(o.delivery_zone, "منطقة اختبار");
    assert.equal(o.transfer_instructions, "TEST transfer details");
    assert.notEqual(o.guest_token_hash, a.token);
    assert.deepEqual(await stock(db), [
      { product_id: "finite", on_hand: 5, reserved: 2 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ]);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from meta_events",
        )
      ).rows[0].count,
      0,
    );
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
    const t = (
      await db.query<{
        value: {
          net_collected: number;
          known_product_cost: number;
          gross_profit: number;
        };
      }>("select finance_overview() value")
    ).rows[0].value;
    assert.equal(t.net_collected, 860);
    assert.equal(t.known_product_cost, 0); // Cash is recorded now; COGS waits for shipment.
    assert.equal(t.gross_profit, 860);
    await db.exec("set role anon");
    assert.equal(
      (
        await db.query<{ value: { order_number: number } }>(
          "select guest_order($1) value",
          [a.token],
        )
      ).rows[0].value.order_number,
      r.order_number,
    );
    assert.equal(
      (
        await db.query<{ value: unknown }>("select guest_order($1) value", [
          crypto.randomUUID(),
        ])
      ).rows[0].value,
      null,
    );
    await db.exec(
      `reset role;select set_config('request.jwt.claim.sub','${customerId}',false);set role authenticated`,
    );
    await db.query("select claim_order($1)", [a.token]);
    assert.equal(
      (await db.query("select id from orders where id=$1", [r.id])).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ value: unknown }>("select guest_order($1) value", [
          a.token,
        ])
      ).rows[0].value,
      null,
    );
  } finally {
    await db.close();
  }
});

test("chat retries return current fulfillment/payment and original prices/fees exactly once", async () => {
  const { db, zone } = await setup();
  try {
    const a = input(zone, { paid: true });
    const r = await create(db, a);
    await db.exec(
      "update inventory set price=999 where product_id in ('finite','unlimited');select set_product_unit_cost('finite',99);select set_product_unit_cost('unlimited',99);update delivery_zones set fee=999,active=false;update checkout_settings set cash_enabled=false;",
    );
    await assert.rejects(
      db.query("select transition_order($1,'shipped')", [r.id]),
      /USE_ORDER_ACTION/,
    );
    await managedShip(db, r.id);
    await managedAction(db, r.id, "refund", {
      amount: 860,
      date: cairoToday(),
      reference: "TEST full refund",
    });
    const before = await counts(db);
    const currentStock = await stock(db);
    const retried = await create(db, {
      ...a,
      customer: { ...customer, name: "  Chat TEST  " },
      lines: [
        { id: "unlimited", qty: 3 },
        { id: "finite", qty: 2 },
      ],
    });
    assert.equal(retried.id, r.id);
    assert.equal(retried.status, "shipped");
    assert.equal(retried.payment_status, "refunded");
    assert.equal(retried.total, 860);
    assert.deepEqual(
      retried.items.map((i) => i.price),
      [100, 200],
    );
    assert.deepEqual(await counts(db), before);
    assert.deepEqual(await stock(db), currentStock);
    assert.equal(
      (
        await db.query<{
          value: { known_product_cost: number; net_collected: number };
        }>("select finance_overview() value")
      ).rows[0].value.known_product_cost,
      210,
    );
    assert.equal(
      (
        await db.query<{ value: { net_collected: number } }>(
          "select finance_overview() value",
        )
      ).rows[0].value.net_collected,
      0,
    );
  } finally {
    await db.close();
  }
});

test("chat idempotency binds actor, source, payload and tracking token", async () => {
  const { db, zone } = await setup();
  try {
    const a = input(zone);
    await create(db, a);
    await assert.rejects(
      create(db, { ...a, paid: true }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      create(db, { ...a, token: crypto.randomUUID() }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      create(db, { ...a, lines: [{ id: "finite", qty: 1 }] }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      create(db, { ...a, key: crypto.randomUUID() }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${secondAdmin}',false)`,
    );
    await assert.rejects(create(db, a), /IDEMPOTENCY_CONFLICT/);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false)`,
    );
    const websiteKey = crypto.randomUUID();
    await db.query(
      "select create_store_order($1,'website',$2::jsonb,'[{\"id\":\"finite\",\"qty\":1}]'::jsonb,'en')",
      [websiteKey, JSON.stringify(customer)],
    );
    await assert.rejects(
      create(db, { ...input(zone), key: websiteKey }),
      /IDEMPOTENCY_CONFLICT/,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from orders",
        )
      ).rows[0].count,
      2,
    );
  } finally {
    await db.close();
  }
});

test("chat creation validates contact and configured checkout options and rolls back partial baskets", async () => {
  const { db, zone } = await setup();
  try {
    for (const patch of [
      { customer: {} },
      { customer: { ...customer, name: null } },
      { customer: { ...customer, name: "x" } },
      { customer: { ...customer, address: "bad\naddress" } },
      { customer: { ...customer, phone: "123+4567" } },
      { lines: [] },
      { lines: [{ id: "finite", qty: 1.5 }] },
      { lines: [{ id: "finite", qty: "2" }] },
      {
        lines: [
          { id: "finite", qty: 1 },
          { id: "finite", qty: 1 },
        ],
      },
      { lines: [{ id: "finite", qty: 100 }] },
      { paid: null },
    ])
      await assert.rejects(create(db, input(zone, patch)), /INVALID_ORDER/);
    await db.exec("update checkout_settings set cash_enabled=false");
    await assert.rejects(create(db, input(zone)), /INVALID_PAYMENT/);
    await db.exec(
      "update checkout_settings set cash_enabled=true,transfer_instructions='',instapay_number='';update delivery_zones set active=false",
    );
    await assert.rejects(create(db, input(zone)), /INVALID_DELIVERY/);
    await db.exec("update delivery_zones set active=true");
    await assert.rejects(
      create(db, input(zone, { payment: "transfer" })),
      /INVALID_PAYMENT/,
    );
    await db.exec("select set_inventory_active('unlimited',false)");
    const before = await counts(db);
    const beforeStock = await stock(db);
    await assert.rejects(
      create(db, input(zone, { paid: true })),
      /OUT_OF_STOCK/,
    );
    assert.deepEqual(await counts(db), before);
    assert.deepEqual(await stock(db), beforeStock);
  } finally {
    await db.close();
  }
});

test("confirmed chat orders do not expire and use normal cancellation/shipping stock rules", async () => {
  const { db, zone } = await setup();
  try {
    const a = await create(db, input(zone));
    await db.query(
      "update orders set expires_at=now()-interval '1 day' where id=$1",
      [a.id],
    );
    await db.exec("select expire_pending_orders()");
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from orders where id=$1",
          [a.id],
        )
      ).rows[0].status,
      "confirmed",
    );
    await managedAction(db, a.id, "cancel");
    assert.deepEqual(await stock(db), [
      { product_id: "finite", on_hand: 5, reserved: 0 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ]);
    const b = await create(db, input(zone));
    await managedShip(db, b.id);
    const shipping = await managedDetail(db, b.id);
    await managedAction(db, b.id, "deliver", {
      shipment_id: shipping.shipments[0].id,
      delivered_on: cairoToday(),
    });
    assert.deepEqual(await stock(db), [
      { product_id: "finite", on_hand: 3, reserved: 0 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ]);
  } finally {
    await db.close();
  }
});

test("chat creation RPC is inaccessible to anonymous clients and denies signed-in nonadmins", async () => {
  const { db, zone } = await setup();
  try {
    await db.exec("set role anon");
    await assert.rejects(create(db, input(zone)), /permission denied/);
    await db.exec(
      `reset role;select set_config('request.jwt.claim.sub','${customerId}',false);set role authenticated`,
    );
    await assert.rejects(create(db, input(zone)), /FORBIDDEN/);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from orders",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});
