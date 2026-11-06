import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001";
const skipped = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup(legacy = false) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id)values('${admin}');`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && !skipped.has(f))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand)values('qa-pot','TEST','اختبار',100,20),('qa-next','Replacement','بديل',150,10);insert into product_costs values('qa-pot',40,now()),('qa-next',60,now());`,
  );
  const zone = (
    await db.query<{ id: string }>(
      `insert into delivery_zones(name_en,name_ar,fee)values('TEST zone','اختبار',20)returning id`,
    )
  ).rows[0].id;
  const o = (
    await db.query<{ v: any }>(
      `select ${legacy ? "create_chat_order_pre_ops" : "create_chat_order"}($1,$2,'{"name":"TEST customer","phone":"01000000000","address":"TEST address"}','[{"id":"qa-pot","qty":3}]','en',$3,'cash',false) v`,
      [crypto.randomUUID(), crypto.randomUUID(), zone],
    )
  ).rows[0].v;
  return { db, id: o.id, zone };
}
async function detail(db: PGlite, id: string) {
  return (await db.query<{ v: any }>("select admin_order_detail($1) v", [id]))
    .rows[0].v;
}
async function action(
  db: PGlite,
  id: string,
  name: string,
  payload: any = {},
  key = crypto.randomUUID(),
  version?: number,
) {
  const d = await detail(db, id);
  return (
    await db.query<{ v: any }>(
      "select admin_order_action($1,$2,$3,$4,$5::jsonb,$6) v",
      [
        id,
        version ?? d.order.revision,
        key,
        name,
        JSON.stringify(payload),
        "TEST action",
      ],
    )
  ).rows[0].v;
}
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
test("partial shipping releases remainders, later shipment freshly checks stock and retry cannot consume twice", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const line = d.items[0].id,
      key = crypto.randomUUID(),
      version = d.order.revision,
      p = {
        lines: [{ item_id: line, quantity: 1 }],
        courier: "TEST carrier",
        tracking_number: "TRACK",
        dispatched_on: day(),
        expected_on: null,
      };
    await action(db, id, "ship", p, key, version);
    await action(db, id, "ship", p, key, version);
    d = await detail(db, id);
    assert.equal(d.items[0].shipped_quantity, 1);
    assert.equal(d.items[0].reserved_quantity, 0);
    assert.equal(d.order.status, "confirmed");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-pot'",
        )
      ).rows[0].n,
      19,
    );
    await db.exec("update inventory set on_hand=0 where product_id='qa-pot'");
    await assert.rejects(
      action(db, id, "ship", { ...p, lines: [{ item_id: line, quantity: 2 }] }),
      /OUT_OF_STOCK/,
    );
    d = await detail(db, id);
    assert.equal(d.items[0].shipped_quantity, 1);
    await assert.rejects(
      db.query("select transition_order($1,'shipped')", [id]),
      /USE_ORDER_ACTION/,
    );
  } finally {
    await db.close();
  }
});
test("catalog replacements preserve lines and totals; cancellations reopen only their own removals", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const line = d.items[0].id;
    await action(db, id, "items", {
      lines: [{ item_id: line, quantity: 2 }],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    d = await detail(db, id);
    assert.equal(d.order.subtotal, 350);
    assert.equal(d.items[0].removed_quantity, 1);
    await action(db, id, "cancel");
    await action(db, id, "reopen");
    d = await detail(db, id);
    assert.equal(d.items[0].removed_quantity, 1);
    assert.equal(d.items[0].reserved_quantity, 2);
    assert.equal(d.items[1].reserved_quantity, 1);
    assert.equal(d.order.subtotal, 350);
    assert.equal(d.order.delivery_fee, 20);
    await assert.rejects(
      action(db, id, "note", { text: "stale" }, crypto.randomUUID(), 0),
      /ORDER_CHANGED/,
    );
  } finally {
    await db.close();
  }
});
test("returns restock only when selected and replacement additions reopen outstanding fulfilment", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const line = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: line, quantity: 3 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    assert.equal(d.order.status, "shipped");
    await assert.rejects(
      action(db, id, "shipment_details", {
        shipment_id: d.shipments[0].id,
        courier: "TEST",
        tracking_number: "X",
        dispatched_on: "2000-01-01",
        expected_on: null,
      }),
      /INVALID_SHIPMENT|DISPATCH_DATE_IMMUTABLE/,
    );
    await action(db, id, "return", {
      lines: [{ item_id: line, quantity: 1, restock: true }],
      returned_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].restocked_quantity, 1);
    assert.equal(d.order.subtotal, 200);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-pot'",
        )
      ).rows[0].n,
      18,
    );
    await action(db, id, "items", {
      lines: [],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    d = await detail(db, id);
    assert.equal(d.order.status, "confirmed");
    assert.equal(d.order.subtotal, 350);
    await assert.rejects(
      action(db, id, "undo_shipment", {
        shipment_id: d.shipments[0].id,
        confirmed_not_dispatched: true,
      }),
      /USE_RETURN_FLOW/,
    );
  } finally {
    await db.close();
  }
});
test("admin guards, private history and clerical undo preserve stock and audit", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const line = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: line, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    await action(db, id, "undo_shipment", {
      shipment_id: d.shipments[0].id,
      confirmed_not_dispatched: true,
    });
    d = await detail(db, id);
    assert.equal(d.items[0].shipped_quantity, 0);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-pot'",
        )
      ).rows[0].n,
      20,
    );
    await db.exec(
      "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false);set role authenticated",
    );
    await assert.rejects(detail(db, id), /FORBIDDEN/);
    await assert.rejects(
      db.query("select * from private.order_events"),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from private.order_events where order_id=$1",
          [id],
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
test("details, internal notes, dates and hold extensions are audited without leaking private history to guests", async () => {
  const { db, id, zone } = await setup();
  try {
    await action(db, id, "details", {
      name: "Corrected TEST",
      phone: "01012345678",
      address: "Corrected TEST address",
      locale: "ar",
      zone_id: zone,
    });
    await action(db, id, "note", { text: "PRIVATE TEST NOTE" });
    let d = await detail(db, id);
    assert.equal(d.order.locale, "ar");
    assert.equal(d.order.customer_name, "Corrected TEST");
    assert.equal(d.notes[0].payload.request.text, "PRIVATE TEST NOTE");
    const token = (
      await db.query<{ v: string }>("select create_order_share_link($1) v", [
        id,
      ])
    ).rows[0].v;
    const guest = (
      await db.query<{ v: any }>("select guest_order($1) v", [token])
    ).rows[0].v;
    assert.ok(!JSON.stringify(guest).includes("PRIVATE TEST NOTE"));
    assert.equal(guest.items[0].reserved_quantity, 3);
    await action(db, id, "order_date", { ordered_on: day() });
    await db.query(
      "update orders set status='pending',expires_at=now()-interval '1 minute' where id=$1",
      [id],
    );
    await action(db, id, "extend", {
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(
      (await db.query<{ n: number }>("select expire_pending_orders() n"))
        .rows[0].n,
      0,
    );
    await db.query(
      "update orders set expires_at=now()-interval '1 minute' where id=$1",
      [id],
    );
    assert.equal(
      (await db.query<{ n: number }>("select expire_pending_orders() n"))
        .rows[0].n,
      1,
    );
    d = await detail(db, id);
    assert.equal(d.items[0].reserved_quantity, 0);
    await action(db, id, "reopen");
    d = await detail(db, id);
    assert.equal(d.items[0].reserved_quantity, 3);
  } finally {
    await db.close();
  }
});
test("legacy dispatched orders initialize progress without stock deductions and can record delivery metadata", async () => {
  const { db, id } = await setup(true);
  try {
    await db.query("select transition_order($1,'shipped')", [id]);
    const before = (
      await db.query<{ n: number }>(
        "select on_hand n from inventory where product_id='qa-pot'",
      )
    ).rows[0].n;
    await action(db, id, "manage");
    let d = await detail(db, id);
    assert.equal(d.items[0].shipped_quantity, 3);
    assert.equal(d.shipments[0].legacy_import, true);
    assert.equal(d.shipments[0].dispatched_on, null);
    await action(db, id, "shipment_details", {
      shipment_id: d.shipments[0].id,
      courier: "TEST unknown date",
      tracking_number: "LEGACY",
      dispatched_on: null,
      expected_on: null,
    });
    d = await detail(db, id);
    assert.equal(d.shipments[0].dispatched_on, null);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-pot'",
        )
      ).rows[0].n,
      before,
    );
    await action(db, id, "shipment_details", {
      shipment_id: d.shipments[0].id,
      courier: "TEST",
      tracking_number: "OLD-SHIP",
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "deliver", {
      shipment_id: d.shipments[0].id,
      delivered_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.order.status, "delivered");
    assert.equal(d.items[0].delivered_quantity, 3);
  } finally {
    await db.close();
  }
});
test("reopening a cancelled remainder never duplicates a later replacement reservation", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    await action(db, id, "ship", {
      lines: [{ item_id: d.items[0].id, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "cancel");
    await action(db, id, "items", {
      lines: [],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    await action(db, id, "reopen");
    d = await detail(db, id);
    assert.equal(d.items[1].reserved_quantity, 1);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select reserved n from inventory where product_id='qa-next'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(d.items[0].reserved_quantity, 2);
  } finally {
    await db.close();
  }
});
test("legacy delivered promotion keeps unknown dates but prevents duplicate delivery or clerical undo", async () => {
  const { db, id } = await setup(true);
  try {
    await db.query("select transition_order($1,'shipped')", [id]);
    await db.query("select transition_order($1,'delivered')", [id]);
    await action(db, id, "manage");
    let d = await detail(db, id);
    assert.equal(d.shipments[0].legacy_delivered, true);
    assert.equal(d.shipments[0].delivered_on, null);
    await assert.rejects(
      action(db, id, "deliver", {
        shipment_id: d.shipments[0].id,
        delivered_on: day(),
      }),
      /INVALID_DELIVERY/,
    );
    await assert.rejects(
      action(db, id, "undo_shipment", {
        shipment_id: d.shipments[0].id,
        confirmed_not_dispatched: true,
      }),
      /INVALID_UNDO/,
    );
    await action(db, id, "shipment_details", {
      shipment_id: d.shipments[0].id,
      courier: "TEST",
      tracking_number: "PAST",
      dispatched_on: day(),
      expected_on: null,
      delivered_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].delivered_quantity, 3);
    assert.equal(d.shipments[0].delivered_on, day());
  } finally {
    await db.close();
  }
});
test("full returns keep the delivery fee unless explicitly waived; partial returns cannot waive it", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const item = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 3 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await assert.rejects(
      action(db, id, "return", {
        lines: [{ item_id: item, quantity: 1, restock: true }],
        returned_on: day(),
        waive_delivery: true,
      }),
      /DELIVERY_WAIVER_REQUIRES_FULL_RETURN/,
    );
    d = await detail(db, id);
    assert.equal(d.items[0].returned_quantity, 0);
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 3, restock: true }],
      returned_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.order.subtotal, 0);
    assert.equal(d.order.delivery_fee, 20);
    await action(db, id, "items", {
      lines: [],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_fee, 20);
    await action(db, id, "ship", {
      lines: [{ item_id: d.items[1].id, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    await action(db, id, "return", {
      lines: [{ item_id: d.items[1].id, quantity: 1, restock: false }],
      returned_on: day(),
      waive_delivery: true,
    });
    d = await detail(db, id);
    assert.equal(d.order.order_total, 0);
    assert.equal(d.order.delivery_fee, 0);
    await action(db, id, "items", {
      lines: [],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_fee, 0);
    assert.equal(d.order.order_total, 150);
  } finally {
    await db.close();
  }
});
test("returned undelivered units close fulfilment without inventing delivery, and replacements can complete", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const original = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: original, quantity: 3 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "return", {
      lines: [{ item_id: original, quantity: 3, restock: true }],
      returned_on: day(),
    });
    await action(db, id, "items", {
      lines: [],
      additions: [{ product_id: "qa-next", quantity: 1 }],
    });
    d = await detail(db, id);
    const replacement = d.items[1].id;
    await action(db, id, "ship", {
      lines: [{ item_id: replacement, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    const shipment = d.shipments.find((s: any) =>
      s.lines.some((l: any) => l.item_id === replacement),
    );
    await action(db, id, "deliver", {
      shipment_id: shipment.id,
      delivered_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.order.status, "delivered");
    assert.equal(d.items[0].delivered_quantity, 0);
    assert.equal(d.items[0].returned_after_delivery_quantity, 0);
    assert.equal(d.items[1].delivered_quantity, 1);
  } finally {
    await db.close();
  }
});
test("delivered then returned units close only once; an undelivered shipment stays open", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const item = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 2 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    const first = d.shipments[0].id;
    await action(db, id, "deliver", {
      shipment_id: first,
      delivered_on: day(),
    });
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 2, restock: false }],
      returned_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].delivered_quantity, 2);
    assert.equal(d.items[0].returned_after_delivery_quantity, 2);
    assert.equal(d.order.status, "shipped");
    const last = d.shipments.find((s: any) => s.id !== first);
    await action(db, id, "deliver", {
      shipment_id: last.id,
      delivered_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].delivered_quantity, 3);
    assert.equal(d.order.status, "delivered");
  } finally {
    await db.close();
  }
});
test("delivery after a partial undelivered return excludes those returned units from delivery counts", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const item = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 3 }],
      dispatched_on: day(),
      expected_on: null,
    });
    d = await detail(db, id);
    const shipment = d.shipments[0].id;
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 1, restock: false }],
      returned_on: day(),
    });
    await action(db, id, "deliver", {
      shipment_id: shipment,
      delivered_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].delivered_quantity, 2);
    assert.equal(d.items[0].returned_quantity, 1);
    assert.equal(d.order.status, "delivered");
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 1, restock: false }],
      returned_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.items[0].returned_after_delivery_quantity, 1);
    assert.equal(d.order.status, "delivered");
  } finally {
    await db.close();
  }
});
test("new website, chat and historical creators retain the configured zone for future adjustments", async () => {
  const { db, id, zone } = await setup();
  try {
    let d = await detail(db, id);
    assert.equal(d.order.delivery_zone_id, zone);
    assert.equal(d.order.ops_managed, true);
    assert.equal(d.items[0].reserved_quantity, 3);
    const key = crypto.randomUUID();
    await db.query(
      `select create_website_order($1,'qa-web','{"name":"TEST website","phone":"01000000000","address":"TEST address"}','[{"id":"qa-next","qty":1}]','ar',$2,$3,'cash',null,false)`,
      [key, crypto.randomUUID(), zone],
    );
    const web = (
      await db.query<{ id: string }>(
        "select id from orders where idempotency_key=$1",
        [key],
      )
    ).rows[0].id;
    d = await detail(db, web);
    assert.equal(d.order.delivery_zone_id, zone);
    assert.equal(d.order.ops_managed, true);
    await action(db, web, "cancel");
    await action(db, web, "reopen");
    d = await detail(db, web);
    assert.equal(d.order.status, "pending");
    const past = (
      await db.query<{ v: any }>(
        `select create_past_chat_order($1,$2,'{"name":"TEST past","phone":"01000000000","address":"TEST address"}','[{"id":"qa-next","qty":1}]','en',$3,'cash',$4::date,false,null,'already_accounted',170) v`,
        [crypto.randomUUID(), crypto.randomUUID(), zone, day()],
      )
    ).rows[0].v;
    d = await detail(db, past.id);
    assert.equal(d.order.delivery_zone_id, zone);
  } finally {
    await db.close();
  }
});
test("an already recorded full return can explicitly waive delivery later without touching stock or cash", async () => {
  const { db, id } = await setup();
  try {
    let d = await detail(db, id);
    const item = d.items[0].id;
    await assert.rejects(
      action(db, id, "waive_delivery"),
      /DELIVERY_WAIVER_REQUIRES_FULL_RETURN/,
    );
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 3 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 3, restock: true }],
      returned_on: day(),
    });
    d = await detail(db, id);
    assert.equal(d.order.order_total, 20);
    const stock = (
      await db.query<{ n: number }>(
        "select on_hand n from inventory where product_id='qa-pot'",
      )
    ).rows[0].n;
    await action(db, id, "waive_delivery");
    d = await detail(db, id);
    assert.equal(d.order.order_total, 0);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-pot'",
        )
      ).rows[0].n,
      stock,
    );
    assert.equal(d.order.amount_received, 0);
    assert.equal(d.order.amount_refunded, 0);
    assert.equal(d.timeline[0].kind, "waive_delivery");
  } finally {
    await db.close();
  }
});
test("explicit historical finite returns physically restock without replaying import deductions", async () => {
  const { db, zone } = await setup();
  try {
    const past = (
      await db.query<{ v: any }>(
        `select create_past_chat_order($1,$2,'{"name":"TEST historical return","phone":"01000000000","address":"TEST address"}','[{"id":"qa-next","qty":2}]','en',$3,'cash',$4::date,false,null,'already_accounted',320) v`,
        [crypto.randomUUID(), crypto.randomUUID(), zone, day()],
      )
    ).rows[0].v;
    const before = (
      await db.query<{ n: number }>(
        "select on_hand n from inventory where product_id='qa-next'",
      )
    ).rows[0].n;
    await action(db, past.id, "manage");
    let d = await detail(db, past.id);
    assert.equal(d.items[0].stock_tracked, false);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-next'",
        )
      ).rows[0].n,
      before,
    );
    await action(db, past.id, "return", {
      lines: [{ item_id: d.items[0].id, quantity: 1, restock: false }],
      returned_on: day(),
    });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-next'",
        )
      ).rows[0].n,
      before,
    );
    await action(db, past.id, "return", {
      lines: [{ item_id: d.items[0].id, quantity: 1, restock: true }],
      returned_on: day(),
    });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select on_hand n from inventory where product_id='qa-next'",
        )
      ).rows[0].n,
      before + 1,
    );
  } finally {
    await db.close();
  }
});
test("new paid chat orders recognize no product cost until shipment, while existing legacy retries stay legacy", async () => {
  const { db, zone } = await setup();
  try {
    const make = async (fn: string, key: string, token: string) =>
      (
        await db.query<{ v: any }>(
          `select ${fn}($1,$2,'{"name":"TEST paid chat","phone":"01000000000","address":"TEST address"}','[{"id":"qa-next","qty":1}]','en',$3,'cash',true) v`,
          [key, token, zone],
        )
      ).rows[0].v;
    const fresh = await make(
      "create_chat_order",
      crypto.randomUUID(),
      crypto.randomUUID(),
    );
    let d = await detail(db, fresh.id);
    assert.equal(d.order.ops_managed, true);
    assert.equal(d.items[0].reserved_quantity, 1);
    assert.equal(d.items[0].shipped_quantity, 0);
    const cost = (
      await db.query<{ n: number }>(
        "select coalesce(sum(quantity_delta),0)::int n from private.order_cost_events where order_id=$1",
        [fresh.id],
      )
    ).rows[0].n;
    assert.equal(cost, 0);
    assert.equal(d.order.amount_received, 170);
    const key = crypto.randomUUID(),
      token = crypto.randomUUID();
    const old = await make("create_chat_order_pre_ops", key, token);
    d = await detail(db, old.id);
    assert.equal(d.order.ops_managed, false);
    await make("create_chat_order", key, token);
    d = await detail(db, old.id);
    assert.equal(d.order.ops_managed, false);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select coalesce(sum(quantity_delta),0)::int n from private.order_cost_events where order_id=$1",
          [old.id],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("contact corrections preserve accepted delivery snapshots even after dispatch or zone pause", async () => {
  const { db, id, zone } = await setup();
  try {
    await db.query(
      "update orders set delivery_fee=100,delivery_zone=$2 where id=$1",
      [id, "Accepted route label"],
    );
    await db.query(
      "update delivery_zones set fee=200,active=false where id=$1",
      [zone],
    );
    let d = await detail(db, id);
    const originalAddress = d.order.customer_address;
    await action(db, id, "details", {
      name: "Corrected contact",
      phone: "01012345678",
      address: originalAddress,
      locale: "ar",
      zone_id: zone,
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_fee, 100);
    assert.equal(d.order.delivery_zone, "Accepted route label");
    assert.equal(d.order.locale, "ar");
    await action(db, id, "ship", {
      lines: [{ item_id: d.items[0].id, quantity: 1 }],
      dispatched_on: day(),
      expected_on: null,
    });
    await action(db, id, "details", {
      name: "Contact after dispatch",
      phone: "01012345679",
      address: originalAddress,
      locale: "en",
      zone_id: zone,
    });
    d = await detail(db, id);
    assert.equal(d.order.customer_name, "Contact after dispatch");
    assert.equal(d.order.delivery_fee, 100);
    const newZone = (
      await db.query<{ id: string }>(
        `insert into delivery_zones(name_en,name_ar,fee)values('Agreed new route','مسار جديد',250)returning id`,
      )
    ).rows[0].id;
    await assert.rejects(
      action(db, id, "details", {
        name: "Contact after dispatch",
        phone: "01012345679",
        address: "Agreed new address",
        locale: "en",
        zone_id: newZone,
      }),
      /DELIVERY_CHANGE_CONFIRMATION_REQUIRED/,
    );
    await action(db, id, "details", {
      name: "Contact after dispatch",
      phone: "01012345679",
      address: "Agreed new address",
      locale: "en",
      zone_id: newZone,
      delivery_change_confirmed: true,
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_zone_id, newZone);
    assert.equal(d.order.delivery_fee, 250);
    assert.equal(d.order.delivery_zone, "Agreed new route");
    assert.equal(d.order.customer_address, "Agreed new address");
  } finally {
    await db.close();
  }
});
test("unknown legacy delivery routes are preserved unless a configured replacement is explicitly selected", async () => {
  const { db, id, zone } = await setup();
  try {
    await db.query(
      "update orders set delivery_zone_id=null,delivery_zone='Unknown historical route',delivery_fee=77 where id=$1",
      [id],
    );
    let d = await detail(db, id);
    await action(db, id, "details", {
      name: "Legacy contact correction",
      phone: "01012345678",
      address: d.order.customer_address,
      locale: "ar",
      zone_id: null,
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_zone_id, null);
    assert.equal(d.order.delivery_zone, "Unknown historical route");
    assert.equal(d.order.delivery_fee, 77);
    await action(db, id, "details", {
      name: "Legacy contact correction",
      phone: "01012345678",
      address: d.order.customer_address,
      locale: "ar",
      zone_id: zone,
    });
    d = await detail(db, id);
    assert.equal(d.order.delivery_zone_id, zone);
    assert.equal(d.order.delivery_fee, 20);
    assert.equal(d.order.delivery_zone, "اختبار");
  } finally {
    await db.close();
  }
});

test("delivery corrections and backdated returns cannot contradict physical return chronology", async () => {
  const { db, id } = await setup();
  try {
    const dates = (
      await db.query<{ earlier: string; later: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-2)::text earlier,((now() at time zone 'Africa/Cairo')::date-1)::text later",
      )
    ).rows[0];
    await action(db, id, "order_date", { ordered_on: dates.earlier });
    let d = await detail(db, id);
    const item = d.items[0].id;
    await action(db, id, "ship", {
      lines: [{ item_id: item, quantity: 3 }],
      dispatched_on: dates.earlier,
    });
    d = await detail(db, id);
    const shipment = d.shipments[0].id;
    await action(db, id, "deliver", {
      shipment_id: shipment,
      delivered_on: dates.later,
    });
    await assert.rejects(
      action(db, id, "return", {
        lines: [{ item_id: item, quantity: 1, restock: true }],
        returned_on: dates.earlier,
      }),
      /INVALID_RETURN_DATE|RETURN_BEFORE_SHIPMENT/,
    );
    await action(db, id, "return", {
      lines: [{ item_id: item, quantity: 1, restock: true }],
      returned_on: dates.later,
    });
    await assert.rejects(
      action(db, id, "shipment_details", {
        shipment_id: shipment,
        dispatched_on: dates.earlier,
        delivered_on: day(),
        courier: "TEST corrected courier",
      }),
      /DELIVERY_AFTER_RETURN/,
    );
    d = await detail(db, id);
    assert.equal(d.shipments[0].delivered_on, dates.later);
    assert.equal(d.items[0].returned_quantity, 1);
  } finally {
    await db.close();
  }
});
