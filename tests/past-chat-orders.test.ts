import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const admin = "00000000-0000-4000-8000-000000000001",
  customerId = "00000000-0000-4000-8000-000000000002",
  otherAdmin = "00000000-0000-4000-8000-000000000003";
const migration = "20261106152505_past_chat_orders.sql";
const schedules = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup(legacy = false) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customerId}'),('${otherAdmin}');`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter(
      (n) =>
        n.endsWith(".sql") && !schedules.has(n) && (!legacy || n !== migration),
    )
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}'),('${otherAdmin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand,reserved,unlimited_stock,active) values('finite','Finite TEST','محدود',100,8,2,false,false),('unlimited','Unlimited TEST','غير محدود',200,0,0,true,false);select set_product_unit_cost('finite',30);select set_product_unit_cost('unlimited',50);update checkout_settings set cash_enabled=false,transfer_enabled=false;`,
  );
  const zone = crypto.randomUUID();
  await db.query(
    "insert into delivery_zones(id,name_en,name_ar,fee,active) values($1,'Old zone','منطقة قديمة',60,false)",
    [zone],
  );
  const dates = (
    await db.query<{
      ordered: string;
      paid: string;
      today: string;
      future: string;
    }>(
      "select ((now() at time zone 'Africa/Cairo')::date-30)::text ordered,((now() at time zone 'Africa/Cairo')::date-29)::text paid,((now() at time zone 'Africa/Cairo')::date)::text today,((now() at time zone 'Africa/Cairo')::date+1)::text future",
    )
  ).rows[0];
  return { db, zone, dates };
}
type Input = {
  key: string;
  token: string;
  customer: unknown;
  lines: unknown;
  locale: string;
  zone: string;
  payment: string;
  ordered: string | null;
  paid: boolean;
  paidOn: string | null;
  stockHandling: string;
  expected: number | string;
};
function input(
  zone: string,
  dates: { ordered: string; paid: string },
  patch: Partial<Input> = {},
): Input {
  return {
    key: crypto.randomUUID(),
    token: crypto.randomUUID(),
    customer: {
      name: "Past TEST",
      phone: "01000000000",
      address: "Disposable historical test address",
    },
    lines: [
      { id: "finite", qty: 2, unit_cost: 0 },
      { id: "unlimited", qty: 3 },
    ],
    locale: "en",
    zone,
    payment: "cash",
    ordered: dates.ordered,
    paid: true,
    paidOn: dates.paid,
    stockHandling: "already_accounted",
    expected: 860,
    ...patch,
  };
}
type Receipt = {
  id: string;
  order_number: number;
  source: string;
  status: string;
  payment_status: string;
  total: number;
  ordered_at: string;
  is_historical: boolean;
  stock_handling: string;
};
async function create(db: PGlite, a: Input) {
  return (
    await db.query<{ value: Receipt }>(
      "select create_past_chat_order($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12) value",
      [
        a.key,
        a.token,
        JSON.stringify(a.customer),
        JSON.stringify(a.lines),
        a.locale,
        a.zone,
        a.payment,
        a.ordered,
        a.paid,
        a.paidOn,
        a.stockHandling,
        a.expected,
      ],
    )
  ).rows[0].value;
}
async function stock(db: PGlite) {
  return (
    await db.query<{ product_id: string; on_hand: number; reserved: number }>(
      "select product_id,on_hand,reserved from inventory where product_id in ('finite','unlimited') order by product_id",
    )
  ).rows;
}
async function counts(db: PGlite) {
  return (
    await db.query(
      "select (select count(*)::int from orders) orders,(select count(*)::int from order_items) items,(select count(*)::int from order_item_costs) costs,(select count(*)::int from stock_movements) movements,(select count(*)::int from admin_notifications) notices,(select count(*)::int from finance_payment_events) payments,(select count(*)::int from meta_events) meta",
    )
  ).rows;
}

test("past paid sale preserves original Cairo dates, explicit/unknown original costs and current stock", async () => {
  const { db, zone, dates } = await setup();
  try {
    const a = input(zone, dates, { payment: "transfer", locale: "ar" });
    const before = await stock(db);
    await db.exec("set role authenticated");
    const r = await create(db, a);
    await db.exec("reset role");
    assert.equal(r.source, "chat");
    assert.equal(r.status, "delivered");
    assert.equal(r.payment_status, "paid");
    assert.equal(r.total, 860);
    assert.equal(r.is_historical, true);
    assert.equal(r.stock_handling, "already_accounted");
    assert.deepEqual(await stock(db), before);
    const o = (
      await db.query<{
        ordered_date: string;
        ordered_time: string;
        recorded_later: boolean;
        recorded_today: boolean;
        recorded_by: string;
        marketing_consent: boolean;
        meta_context: unknown;
        zone: string;
      }>(
        "select (ordered_at at time zone 'Africa/Cairo')::date::text ordered_date,(ordered_at at time zone 'Africa/Cairo')::time::text ordered_time,created_at>ordered_at recorded_later,(created_at at time zone 'Africa/Cairo')::date=(now() at time zone 'Africa/Cairo')::date recorded_today,recorded_by,marketing_consent,meta_context,delivery_zone zone from orders where id=$1",
        [r.id],
      )
    ).rows[0];
    assert.equal(o.ordered_date, dates.ordered);
    assert.equal(o.ordered_time, "12:00:00");
    assert.equal(o.recorded_later, true);
    assert.equal(o.recorded_today, true);
    assert.equal(o.recorded_by, admin);
    assert.equal(o.marketing_consent, false);
    assert.deepEqual(o.meta_context, {});
    assert.equal(o.zone, "منطقة قديمة");
    assert.deepEqual(
      (
        await db.query(
          "select i.product_id,i.stock_tracked,c.unit_cost from order_items i join order_item_costs c on c.item_id=i.id order by i.product_id",
        )
      ).rows,
      [
        { product_id: "finite", stock_tracked: false, unit_cost: "0.00" },
        { product_id: "unlimited", stock_tracked: false, unit_cost: null },
      ],
    );
    const payment = (
      await db.query<{
        amount: string;
        paid_date: string;
        paid_time: string;
        recorded_today: boolean;
      }>(
        "select amount,(occurred_at at time zone 'Africa/Cairo')::date::text paid_date,(occurred_at at time zone 'Africa/Cairo')::time::text paid_time,(recorded_at at time zone 'Africa/Cairo')::date=(now() at time zone 'Africa/Cairo')::date recorded_today from finance_payment_events where order_id=$1",
        [r.id],
      )
    ).rows[0];
    assert.equal(Number(payment.amount), 860);
    assert.equal(payment.paid_date, dates.paid);
    assert.equal(payment.paid_time, "12:00:00");
    assert.equal(payment.recorded_today, true);
    const t = (
      await db.query<{
        value: {
          net_collected: number;
          known_product_cost: number;
          missing_cost_items: number;
          gross_profit: null;
        };
      }>("select finance_overview($1,$1) value", [dates.paid])
    ).rows[0].value;
    assert.equal(t.net_collected, 860);
    assert.equal(t.known_product_cost, 0);
    assert.equal(t.missing_cost_items, 1);
    assert.equal(t.gross_profit, null);
    assert.equal(
      (
        await db.query<{ value: { net_collected: number } }>(
          "select finance_overview($1,$1) value",
          [dates.ordered],
        )
      ).rows[0].value.net_collected,
      0,
    );
    assert.deepEqual(await counts(db), [
      {
        orders: 1,
        items: 2,
        costs: 2,
        movements: 0,
        notices: 0,
        payments: 1,
        meta: 0,
      },
    ]);
    await db.exec("set role anon");
    const guest = (
      await db.query<{ value: { ordered_at: string; is_historical: boolean } }>(
        "select guest_order($1) value",
        [a.token],
      )
    ).rows[0].value;
    assert.equal(guest.ordered_at, r.ordered_at);
    assert.equal(guest.is_historical, true);
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

test("past deduct_now consumes only finite available stock once and can alert low stock without a new-order push", async () => {
  const { db, zone, dates } = await setup();
  try {
    await db.exec("select set_inventory_active('finite',true)");
    const a = input(zone, dates, {
      lines: [
        { id: "finite", qty: 3, unit_cost: 12 },
        { id: "unlimited", qty: 2, unit_cost: 20 },
      ],
      expected: 760,
      stockHandling: "deduct_now",
    });
    const r = await create(db, a);
    assert.deepEqual(await stock(db), [
      { product_id: "finite", on_hand: 5, reserved: 2 },
      { product_id: "unlimited", on_hand: 0, reserved: 0 },
    ]);
    assert.deepEqual(
      (
        await db.query(
          "select product_id,on_hand_delta,reserved_delta,reason from stock_movements",
        )
      ).rows,
      [
        {
          product_id: "finite",
          on_hand_delta: -3,
          reserved_delta: 0,
          reason: "past_order_deducted",
        },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          "select kind,count(*)::int count from admin_notifications group by kind",
        )
      ).rows,
      [{ kind: "low_stock", count: 1 }],
    );
    const before = await counts(db);
    assert.equal((await create(db, a)).id, r.id);
    assert.deepEqual(await counts(db), before);
    assert.equal((await stock(db))[0].on_hand, 5);
    assert.equal(
      (
        await db.query<{ value: { known_product_cost: number } }>(
          "select finance_overview() value",
        )
      ).rows[0].value.known_product_cost,
      76,
    );
  } finally {
    await db.close();
  }
});

test("past retries preserve current payment state and original snapshots after prices, fees and dates change", async () => {
  const { db, zone, dates } = await setup();
  try {
    const a = input(zone, dates, {
      lines: [
        { id: "finite", qty: 2, unit_cost: 10 },
        { id: "unlimited", qty: 3, unit_cost: 20 },
      ],
    });
    const r = await create(db, a);
    await db.exec(
      "update inventory set price=999 where product_id in ('finite','unlimited');update delivery_zones set fee=999;select set_product_unit_cost('finite',999)",
    );
    await db.query("select set_order_payment($1,'refunded')", [r.id]);
    const events = (
      await db.query(
        "select id,event_type,amount,occurred_at,recorded_at from finance_payment_events order by id",
      )
    ).rows;
    const before = await counts(db);
    const retry = await create(db, {
      ...a,
      lines: [
        { id: "unlimited", qty: 3, unit_cost: 20.0 },
        { id: "finite", qty: 2, unit_cost: 10.0 },
      ],
    });
    assert.equal(retry.id, r.id);
    assert.equal(retry.payment_status, "refunded");
    assert.equal(retry.total, 860);
    assert.equal(retry.ordered_at, r.ordered_at);
    assert.deepEqual(await counts(db), before);
    assert.deepEqual(
      (
        await db.query(
          "select id,event_type,amount,occurred_at,recorded_at from finance_payment_events order by id",
        )
      ).rows,
      events,
    );
    for (const patch of [
      { token: crypto.randomUUID() },
      { ordered: dates.paid },
      { stockHandling: "deduct_now" },
      { expected: 861 },
      { paid: false, paidOn: null },
      {
        lines: [
          { id: "finite", qty: 2, unit_cost: 11 },
          { id: "unlimited", qty: 3, unit_cost: 20 },
        ],
      },
    ])
      await assert.rejects(
        create(db, { ...a, ...patch }),
        /IDEMPOTENCY_CONFLICT/,
      );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${otherAdmin}',false)`,
    );
    await assert.rejects(create(db, a), /IDEMPOTENCY_CONFLICT/);
  } finally {
    await db.close();
  }
});

test("past dates, original costs, exact totals and stock floors are validated with no partial records", async () => {
  const { db, zone, dates } = await setup();
  try {
    for (const patch of [
      { ordered: null },
      { ordered: dates.future },
      { ordered: "infinity" },
      { ordered: "-infinity" },
      { paidOn: null },
      { paidOn: dates.ordered, ordered: dates.paid },
      { paidOn: dates.future },
      { paidOn: "infinity" },
      { paidOn: "-infinity" },
      { paid: false, paidOn: dates.paid },
    ])
      await assert.rejects(
        create(db, input(zone, dates, patch)),
        /INVALID_DATE/,
      );
    for (const cost of [-1, 1.001, "12", true])
      await assert.rejects(
        create(
          db,
          input(zone, dates, {
            lines: [{ id: "finite", qty: 2, unit_cost: cost }],
          }),
        ),
        /INVALID_COST/,
      );
    await assert.rejects(
      create(db, input(zone, dates, { expected: 860.001 })),
      /TOTAL_MISMATCH/,
    );
    await assert.rejects(
      create(db, input(zone, dates, { expected: "NaN" })),
      /TOTAL_MISMATCH/,
    );
    await assert.rejects(
      create(db, input(zone, dates, { expected: 859 })),
      /TOTAL_MISMATCH/,
    );
    await assert.rejects(
      create(db, input(zone, dates, { stockHandling: "unknown" })),
      /INVALID_STOCK_HANDLING/,
    );
    await assert.rejects(
      create(db, input(zone, dates, { zone: crypto.randomUUID() })),
      /INVALID_DELIVERY/,
    );
    await assert.rejects(
      create(db, input(zone, dates, { payment: "card" })),
      /INVALID_PAYMENT/,
    );
    const before = await counts(db),
      stockBefore = await stock(db);
    await assert.rejects(
      create(
        db,
        input(zone, dates, {
          stockHandling: "deduct_now",
          lines: [
            { id: "finite", qty: 7 },
            { id: "unlimited", qty: 3 },
          ],
          expected: 1360,
        }),
      ),
      /OUT_OF_STOCK/,
    );
    await assert.rejects(
      create(
        db,
        input(zone, dates, {
          stockHandling: "deduct_now",
          lines: [
            { id: "finite", qty: 1 },
            { id: "missing-product", qty: 1 },
          ],
          expected: 160,
        }),
      ),
      /OUT_OF_STOCK/,
    );
    assert.deepEqual(await counts(db), before);
    assert.deepEqual(await stock(db), stockBefore);
    // A downstream payment failure must also roll back earlier stock, costs and low-stock alerts.
    await db.exec(
      "select set_inventory_active('finite',true);alter table finance_payment_events add constraint fixture_receipt_failure check(amount<0)",
    );
    await assert.rejects(
      create(
        db,
        input(zone, dates, {
          stockHandling: "deduct_now",
          lines: [
            { id: "finite", qty: 3 },
            { id: "unlimited", qty: 2 },
          ],
          expected: 760,
        }),
      ),
      /fixture_receipt_failure/,
    );
    assert.deepEqual(await counts(db), before);
    assert.deepEqual(await stock(db), stockBefore);
    await db.exec(
      "alter table finance_payment_events drop constraint fixture_receipt_failure",
    );
    const unpaid = await create(
      db,
      input(zone, dates, { paid: false, paidOn: null }),
    );
    assert.equal(unpaid.payment_status, "unpaid");
    assert.equal(
      (await db.query("select * from finance_payment_events")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("past and new chat modes share idempotency namespaces and past RPC denies anon/nonadmins", async () => {
  const { db, zone, dates } = await setup();
  try {
    const a = input(zone, dates);
    await create(db, a);
    await assert.rejects(
      create(db, { ...a, key: crypto.randomUUID() }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      db.query(
        "select create_chat_order($1,$2,$3::jsonb,$4::jsonb,'en',$5,'cash',false)",
        [
          a.key,
          crypto.randomUUID(),
          JSON.stringify(a.customer),
          JSON.stringify(a.lines),
          zone,
        ],
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    await db.exec(
      "update delivery_zones set active=true;update checkout_settings set cash_enabled=true;update inventory set active=true",
    );
    const newKey = crypto.randomUUID(),
      newToken = crypto.randomUUID();
    await db.query(
      "select create_chat_order($1,$2,$3::jsonb,'[{\"id\":\"finite\",\"qty\":1}]'::jsonb,'en',$4,'cash',false)",
      [newKey, newToken, JSON.stringify(a.customer), zone],
    );
    await assert.rejects(
      create(db, { ...input(zone, dates), key: newKey }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      create(db, { ...input(zone, dates), token: newToken }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await db.exec("set role anon");
    await assert.rejects(create(db, input(zone, dates)), /permission denied/);
    await db.exec(
      `reset role;select set_config('request.jwt.claim.sub','${customerId}',false);set role authenticated`,
    );
    await assert.rejects(create(db, input(zone, dates)), /FORBIDDEN/);
  } finally {
    await db.close();
  }
});

test("original-date migration backfills existing order dates without changing recording time", async () => {
  const { db } = await setup(true);
  try {
    await db.exec(
      "insert into orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale,created_at) values(gen_random_uuid(),'legacy','Legacy TEST','01000000000','Old address','en',now()-interval '45 days')",
    );
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    const row = (
      await db.query<{
        same: boolean;
        is_historical: boolean;
        stock_handling: null;
        source: string;
      }>(
        "select ordered_at=created_at same,is_historical,stock_handling,source from orders",
      )
    ).rows[0];
    assert.deepEqual(row, {
      same: true,
      is_historical: false,
      stock_handling: null,
      source: "website",
    });
  } finally {
    await db.close();
  }
});
