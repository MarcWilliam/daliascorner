import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = "20261106180143_restrict_client_sequence_access.sql";
const schedules = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
const admin = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002";
async function sequenceAcl(db: PGlite) {
  return (
    await db.query<{
      name: string;
      owner: string;
      anon: boolean;
      authenticated: boolean;
      service_usage: boolean;
      service_select: boolean;
      service_update: boolean;
      owner_usage: boolean;
      owner_select: boolean;
      owner_update: boolean;
    }>(
      "select c.relname name,pg_get_userbyid(c.relowner) owner,has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') anon,has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE') authenticated,has_sequence_privilege('service_role',c.oid,'USAGE') service_usage,has_sequence_privilege('service_role',c.oid,'SELECT') service_select,has_sequence_privilege('service_role',c.oid,'UPDATE') service_update,has_sequence_privilege(c.relowner,c.oid,'USAGE') owner_usage,has_sequence_privilege(c.relowner,c.oid,'SELECT') owner_select,has_sequence_privilege(c.relowner,c.oid,'UPDATE') owner_update from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S' order by c.relname",
    )
  ).rows;
}
async function identity(db: PGlite, id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec(`set role ${role}`);
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

test("client sequence grants and postgres defaults are removed while owner/service access and checked workflows remain intact", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create role supabase_admin;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customer}');alter default privileges for role postgres in schema public grant all on sequences to public,anon,authenticated,service_role;alter default privileges for role supabase_admin in schema public grant all on sequences to anon,authenticated,service_role;`,
    );
    for (const name of readdirSync("supabase/migrations")
      .filter((n) => n.endsWith(".sql") && !schedules.has(n) && n !== migration)
      .sort())
      await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    const before = await sequenceAcl(db);
    assert.equal(before.length, 5);
    assert.ok(before.every((row) => row.anon && row.authenticated));
    const platformDefault = (
      await db.query(
        "select defaclacl::text acl from pg_default_acl where defaclrole='supabase_admin'::regrole and defaclobjtype='S' and defaclnamespace='public'::regnamespace",
      )
    ).rows;
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    const after = await sequenceAcl(db);
    assert.equal(after.length, 5);
    for (const row of after) {
      assert.equal(row.anon, false, row.name);
      assert.equal(row.authenticated, false, row.name);
      const prior = before.find((p) => p.name === row.name)!;
      assert.deepEqual(
        [row.service_usage, row.service_select, row.service_update],
        [prior.service_usage, prior.service_select, prior.service_update],
        row.name,
      );
      assert.deepEqual(
        [row.owner_usage, row.owner_select, row.owner_update],
        [true, true, true],
        row.name,
      );
    }
    assert.deepEqual(
      (
        await db.query(
          "select defaclacl::text acl from pg_default_acl where defaclrole='supabase_admin'::regrole and defaclobjtype='S' and defaclnamespace='public'::regnamespace",
        )
      ).rows,
      platformDefault,
    );

    // Check actual sequence operations under JWT database roles, including an admin.
    for (const [id, role] of [
      [null, "anon"],
      [customer, "authenticated"],
      [admin, "authenticated"],
    ] as const) {
      await identity(db, id, role);
      for (const seq of after) {
        await assert.rejects(
          db.query(`select last_value from public.${seq.name}`),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select nextval($1::regclass)", [`public.${seq.name}`]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select setval($1::regclass,1,false)", [
            `public.${seq.name}`,
          ]),
          /permission denied/,
        );
      }
    }

    // All five ID sequences are used behind checked owner-executed order/payment RPCs.
    await db.exec("reset role");
    await db.exec(
      `insert into admin_users values('${admin}');insert into inventory(product_id,name_en,name_ar,price,on_hand) values('sequence-pot','Sequence TEST','اختبار',100,5);`,
    );
    const zone = crypto.randomUUID();
    await db.query(
      "insert into delivery_zones(id,name_en,name_ar,fee) values($1,'Sequence zone','اختبار',60)",
      [zone],
    );
    await identity(db, admin);
    const receipt = (
      await db.query<{
        value: {
          id: string;
          order_number: number;
          status: string;
          payment_status: string;
          total: number;
        };
      }>(
        'select create_chat_order($1,$2,\'{"name":"Sequence TEST","phone":"01000000000","address":"Fixture address"}\'::jsonb,\'[{"id":"sequence-pot","qty":2}]\'::jsonb,\'en\',$3,\'cash\',true) value',
        [crypto.randomUUID(), crypto.randomUUID(), zone],
      )
    ).rows[0].value;
    assert.equal(receipt.order_number, 1);
    assert.equal(receipt.status, "confirmed");
    assert.equal(receipt.payment_status, "paid");
    assert.equal(receipt.total, 260);
    await assert.rejects(
      db.query("select set_order_payment($1,'unpaid')", [receipt.id]),
      /USE_ORDER_ACTION/,
    );
    await managedAction(db, receipt.id, "refund", {
      amount: 260,
      date: cairoToday(),
      reference: "Sequence TEST refund",
    });
    await managedAction(db, receipt.id, "payment", {
      amount: 260,
      date: cairoToday(),
      reference: "Sequence TEST repayment",
    });
    await db.exec("select restock_inventory('sequence-pot',3,'add')");
    assert.deepEqual(
      (
        await db.query(
          "select on_hand,reserved from inventory where product_id='sequence-pot'",
        )
      ).rows,
      [{ on_hand: 8, reserved: 2 }],
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from finance_payment_events",
        )
      ).rows[0].count,
      3,
    );
    await identity(db, customer);
    const profile = (
      await db.query<{ value: { user_id: string; full_name: string } }>(
        "select save_customer_profile('Ordinary customer') value",
      )
    ).rows[0].value;
    assert.equal(profile.user_id, customer);
    assert.equal(profile.full_name, "Ordinary customer");
    assert.equal(
      (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
        .value,
      false,
    );

    // Existing service ACLs and future postgres sequence defaults remain deliberate.
    await identity(db, null, "service_role");
    for (const seq of after) {
      const value = (
        await db.query<{ last_value: number }>(
          `select last_value from public.${seq.name}`,
        )
      ).rows[0].last_value;
      await db.query("select setval($1::regclass,$2,true)", [
        `public.${seq.name}`,
        value,
      ]);
    }
    await db.exec("reset role;create sequence public.future_feature_seq");
    const future = (await sequenceAcl(db)).find(
      (row) => row.name === "future_feature_seq",
    )!;
    assert.equal(future.anon, false);
    assert.equal(future.authenticated, false);
    assert.deepEqual(
      [future.service_usage, future.service_select, future.service_update],
      [true, true, true],
    );
    assert.deepEqual(
      [future.owner_usage, future.owner_select, future.owner_update],
      [true, true, true],
    );
  } finally {
    await db.close();
  }
});
