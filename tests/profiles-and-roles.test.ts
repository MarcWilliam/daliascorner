import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const admin = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000002";
const otherCustomer = "00000000-0000-4000-8000-000000000003";
const otherAdmin = "00000000-0000-4000-8000-000000000004";
const migration = "20261106172925_customer_profiles_and_access_hardening.sql";
const schedules = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
const adminFunctions = [
  "transition_order",
  "set_order_payment",
  "adjust_stock",
  "restock_inventory",
  "set_inventory_mode",
  "set_inventory_active",
  "set_product_unit_cost",
  "set_order_item_cost",
  "add_finance_entry",
  "void_finance_entry",
  "finance_overview",
  "finance_missing_costs",
  "create_chat_order",
  "create_past_chat_order",
];
const backendFunctions = [
  "create_store_order",
  "create_website_order",
  "expire_pending_orders",
  "claim_notifications",
  "claim_meta_events",
];
const adminTables = [
  "inventory",
  "stock_movements",
  "admin_notifications",
  "product_costs",
  "order_item_costs",
  "finance_entries",
  "finance_payment_events",
  "push_subscriptions",
];
type Profile = {
  user_id: string;
  full_name: string;
  phone: string;
  delivery_address: string;
  delivery_zone_id: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  updated_at: string;
};
async function identity(
  db: PGlite,
  user: string | null,
  role = "authenticated",
) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [
      user ?? "",
      JSON.stringify({
        sub: user,
        role: "authenticated",
        user_metadata: { role: "admin", is_admin: true },
        app_metadata: { role: "admin" },
      }),
    ],
  );
  await db.exec(`set role ${role}`);
}
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id,raw_user_meta_data) values('${admin}','{}'),('${customer}','{"role":"admin","is_admin":true}'),('${otherCustomer}','{}'),('${otherAdmin}','{}');`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql") && !schedules.has(n))
    .sort()) {
    if (name === migration) {
      // Reproduce the hosted default-ACL issue, including RLS-bypassing TRUNCATE.
      await db.exec(
        "grant all on delivery_zones,checkout_settings to public,anon,authenticated;alter default privileges grant all on tables to public,anon,authenticated",
      );
    }
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  await db.exec(
    `insert into admin_users values('${admin}'),('${otherAdmin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand) values('role-pot','Role TEST','اختبار',100,100);select set_product_unit_cost('role-pot',30);`,
  );
  const zone = crypto.randomUUID(),
    inactiveZone = crypto.randomUUID();
  await db.query(
    "insert into delivery_zones(id,name_en,name_ar,fee,active) values($1,'Active TEST','متاح',60,true),($2,'Inactive TEST','متوقف',70,false)",
    [zone, inactiveZone],
  );
  const ids: string[] = [];
  for (const owner of [customer, otherCustomer, admin, null]) {
    const key = crypto.randomUUID();
    await db.query(
      'select create_store_order($1,\'role-fixture\',\'{"name":"Role TEST","phone":"01000000000","address":"Fixture address"}\'::jsonb,\'[{"id":"role-pot","qty":1}]\'::jsonb,\'en\')',
      [key],
    );
    const id = (
      await db.query<{ id: string }>(
        "update orders set customer_id=$2 where idempotency_key=$1 returning id",
        [key, owner],
      )
    ).rows[0].id;
    ids.push(id);
  }
  await db.query("select set_order_payment($1,'paid')", [ids[0]]);
  await db.exec(
    "select add_finance_entry(current_date,'marketing',20,'Role fixture');insert into push_subscriptions(endpoint,user_id,p256dh,auth) values('https://web.push.apple.com/role-fixture','" +
      admin +
      "','fixture','fixture')",
  );
  const functions = (
    await db.query<{ proname: string; args: string }>(
      "select p.proname,coalesce((select string_agg('NULL::'||format_type(t.oid,null),',' order by t.n) from unnest(p.proargtypes) with ordinality t(oid,n)),'') args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
    )
  ).rows;
  return { db, zone, inactiveZone, ids, functions };
}
async function save(
  db: PGlite,
  name: string | null,
  phone: string | null = "",
  address: string | null = "",
  zone: string | null = null,
) {
  return (
    await db.query<{ value: Profile }>(
      "select save_customer_profile($1,$2,$3,$4) value",
      [name, phone, address, zone],
    )
  ).rows[0].value;
}
async function skip(db: PGlite) {
  return (
    await db.query<{ value: Profile }>(
      "select skip_customer_onboarding() value",
    )
  ).rows[0].value;
}
async function assertAdminDenied(
  db: PGlite,
  functions: { proname: string; args: string }[],
) {
  assert.equal(
    (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
      .value,
    false,
  );
  for (const name of adminFunctions) {
    const f = functions.find((f) => f.proname === name)!;
    await assert.rejects(
      db.query(`select public.${name}(${f.args})`),
      /FORBIDDEN/,
      name,
    );
  }
  for (const name of backendFunctions) {
    const f = functions.find((f) => f.proname === name)!;
    await assert.rejects(
      db.query(`select public.${name}(${f.args})`),
      /permission denied/,
      name,
    );
  }
  for (const table of adminTables)
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
      table,
    );
  await assert.rejects(
    db.query("insert into admin_users(user_id) values($1)", [customer]),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("select * from meta_events"),
    /permission denied/,
  );
}

test("lazy profiles save optional delivery details, complete once, clear details and preserve completion on skip", async () => {
  const { db, zone } = await setup();
  try {
    assert.equal(
      (await db.query("select * from customer_profiles")).rows.length,
      0,
    );
    await identity(db, customer);
    const skipped = await skip(db);
    assert.equal(skipped.user_id, customer);
    assert.equal(skipped.full_name, "");
    assert.equal(skipped.completed_at, null);
    assert.ok(skipped.skipped_at);
    const profile = await save(
      db,
      "  Customer TEST  ",
      " +20 (100) 000-0000 ",
      " Test delivery address ",
      zone,
    );
    assert.equal(profile.user_id, customer);
    assert.equal(profile.full_name, "Customer TEST");
    assert.equal(profile.phone, "+20 (100) 000-0000");
    assert.equal(profile.delivery_address, "Test delivery address");
    assert.equal(profile.delivery_zone_id, zone);
    assert.ok(profile.completed_at);
    assert.equal(profile.skipped_at, null);
    assert.deepEqual(await skip(db), profile);
    const cleared = await save(db, "Customer Updated", null, null, null);
    assert.equal(cleared.phone, "");
    assert.equal(cleared.delivery_address, "");
    assert.equal(cleared.delivery_zone_id, null);
    assert.equal(cleared.completed_at, profile.completed_at);
    assert.equal(cleared.skipped_at, null);
    await identity(db, otherCustomer);
    const nameOnly = await save(db, "Name only");
    assert.ok(nameOnly.completed_at);
    assert.equal(nameOnly.phone, "");
    assert.equal(nameOnly.delivery_address, "");
  } finally {
    await db.close();
  }
});

test("profile validation rejects malformed fields and inactive zones without creating or changing a row", async () => {
  const { db, zone, inactiveZone } = await setup();
  try {
    await identity(db, customer);
    for (const name of [null, "x", "x".repeat(121), "A\nName"])
      await assert.rejects(save(db, name), /INVALID_NAME/);
    for (const phone of ["123456", "123+4567", "0123\t4567", "0".repeat(31)])
      await assert.rejects(save(db, "Valid Name", phone), /INVALID_PHONE/);
    for (const address of ["tiny", "a".repeat(501), "bad\naddress"])
      await assert.rejects(
        save(db, "Valid Name", "", address),
        /INVALID_ADDRESS/,
      );
    await assert.rejects(
      save(db, "Valid Name", "", "", inactiveZone),
      /INVALID_DELIVERY/,
    );
    await assert.rejects(
      save(db, "Valid Name", "", "", crypto.randomUUID()),
      /INVALID_DELIVERY/,
    );
    assert.equal(
      (await db.query("select * from customer_profiles")).rows.length,
      0,
    );
    const valid = await save(
      db,
      "Valid Name",
      "01000000000",
      "Valid address",
      zone,
    );
    await assert.rejects(save(db, "Different Name", "bad"), /INVALID_PHONE/);
    assert.deepEqual(
      (
        await db.query<{ value: Profile }>(
          "select to_jsonb(p) value from customer_profiles p",
        )
      ).rows[0].value,
      valid,
    );
    await identity(db, null);
    await assert.rejects(save(db, "Name"), /SIGN_IN_REQUIRED/);
    await assert.rejects(skip(db), /SIGN_IN_REQUIRED/);
  } finally {
    await db.close();
  }
});

test("profile ownership has no admin bypass, no direct writes and no role or arbitrary user arguments", async () => {
  const { db, zone } = await setup();
  try {
    await identity(db, customer);
    await save(db, "Customer profile", "01000000000", "Customer address", zone);
    await assert.rejects(
      db.query(
        "insert into customer_profiles(user_id,full_name) values($1,'Injected')",
        [otherCustomer],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(
        "update customer_profiles set completed_at=now(),skipped_at=null",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("delete from customer_profiles"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("truncate customer_profiles"),
      /permission denied/,
    );
    await identity(db, otherCustomer);
    assert.equal(
      (await db.query("select * from customer_profiles")).rows.length,
      0,
    );
    await save(db, "Other profile");
    await identity(db, admin);
    assert.equal(
      (await db.query("select * from customer_profiles")).rows.length,
      0,
    );
    await save(db, "Admin own profile");
    assert.deepEqual(
      (
        await db.query<{ user_id: string }>(
          "select user_id from customer_profiles",
        )
      ).rows,
      [{ user_id: admin }],
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from customer_profiles",
        )
      ).rows[0].count,
      3,
    );
    const columns = (
      await db.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema='public' and table_name='customer_profiles'",
      )
    ).rows.map((r) => r.column_name);
    assert.ok(!columns.some((name) => /role|admin|email/.test(name)));
    const args = (
      await db.query<{ proargnames: string[] }>(
        "select proargnames from pg_proc where proname='save_customer_profile'",
      )
    ).rows[0].proargnames;
    assert.deepEqual(args, [
      "p_full_name",
      "p_phone",
      "p_delivery_address",
      "p_delivery_zone_id",
    ]);
    await db.query("delete from delivery_zones where id=$1", [zone]);
    assert.equal(
      (
        await db.query<{ delivery_zone_id: null }>(
          "select delivery_zone_id from customer_profiles where user_id=$1",
          [customer],
        )
      ).rows[0].delivery_zone_id,
      null,
    );
    await db.query("delete from auth.users where id=$1", [otherCustomer]);
    assert.equal(
      (
        await db.query("select * from customer_profiles where user_id=$1", [
          otherCustomer,
        ])
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("spoofed role metadata never grants administration or another customer's orders or profiles", async () => {
  const { db, functions, ids } = await setup();
  try {
    const newcomer = crypto.randomUUID();
    await db.query(
      'insert into auth.users(id,raw_user_meta_data) values($1,\'{"role":"admin","is_admin":true}\')',
      [newcomer],
    );
    await identity(db, newcomer);
    assert.equal(
      (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
        .value,
      false,
    );
    assert.equal(
      (await db.query("select * from customer_profiles")).rows.length,
      0,
    );
    await save(db, "New ordinary customer");
    assert.equal(
      (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
        .value,
      false,
    );
    await identity(db, otherCustomer);
    await save(db, "Other customer private");
    await identity(db, customer);
    await save(db, "Spoofed admin profile");
    await assertAdminDenied(db, functions);
    assert.deepEqual(
      (await db.query<{ id: string }>("select id from orders")).rows,
      [{ id: ids[0] }],
    );
    assert.equal((await db.query("select * from order_items")).rows.length, 1);
    assert.equal(
      (await db.query("select * from orders where id=$1", [ids[1]])).rows
        .length,
      0,
    );
    assert.deepEqual(
      (
        await db.query<{ user_id: string }>(
          "select user_id from customer_profiles",
        )
      ).rows,
      [{ user_id: customer }],
    );
    await assert.rejects(
      db.exec("update customer_profiles set user_id='" + admin + "'"),
      /permission denied/,
    );
    assert.equal(
      (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
        .value,
      false,
    );
  } finally {
    await db.close();
  }
});

test("revoking membership immediately removes every admin RPC/table permission while preserving own customer access", async () => {
  const { db, functions, ids } = await setup();
  try {
    await identity(db, admin);
    assert.equal(
      (await db.query<{ value: boolean }>("select is_admin() value")).rows[0]
        .value,
      true,
    );
    for (const table of adminTables)
      assert.ok(
        (await db.query(`select * from public.${table}`)).rows.length > 0,
        table,
      );
    await save(db, "Former admin own profile");
    await db.exec("reset role");
    await db.query("delete from admin_users where user_id=$1", [admin]);
    await db.exec("set role authenticated");
    await assertAdminDenied(db, functions);
    assert.deepEqual(
      (await db.query<{ id: string }>("select id from orders")).rows,
      [{ id: ids[2] }],
    );
    assert.equal((await db.query("select * from order_items")).rows.length, 1);
    assert.equal(
      (await db.query<Profile>("select * from customer_profiles")).rows[0]
        .full_name,
      "Former admin own profile",
    );
    assert.equal(
      (await save(db, "Ordinary customer now")).full_name,
      "Ordinary customer now",
    );
  } finally {
    await db.close();
  }
});

test("effective ACLs remove inherited truncate rights and maintain explicit public, customer, admin and backend boundaries", async () => {
  const { db, functions, zone } = await setup();
  try {
    const tableAcl = (
      await db.query<{
        relname: string;
        relrowsecurity: boolean;
        anon_truncate: boolean;
        auth_truncate: boolean;
        anon_trigger: boolean;
        auth_trigger: boolean;
        anon_references: boolean;
        auth_references: boolean;
      }>(
        "select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'TRUNCATE') anon_truncate,has_table_privilege('authenticated',c.oid,'TRUNCATE') auth_truncate,has_table_privilege('anon',c.oid,'TRIGGER') anon_trigger,has_table_privilege('authenticated',c.oid,'TRIGGER') auth_trigger,has_table_privilege('anon',c.oid,'REFERENCES') anon_references,has_table_privilege('authenticated',c.oid,'REFERENCES') auth_references from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
      )
    ).rows;
    for (const row of tableAcl) {
      assert.equal(row.relrowsecurity, true, row.relname);
      assert.ok(
        !row.anon_truncate &&
          !row.auth_truncate &&
          !row.anon_trigger &&
          !row.auth_trigger &&
          !row.anon_references &&
          !row.auth_references,
        row.relname,
      );
    }
    const anonFunctions = (
      await db.query<{ proname: string }>(
        "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE') order by p.proname",
      )
    ).rows.map((r) => r.proname);
    assert.deepEqual(anonFunctions, [
      "guest_order",
      "revoke_order_marketing",
      "store_availability",
    ]);
    assert.equal(
      (
        await db.query(
          "select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not (coalesce(p.proconfig,'{}') @> array['search_path=\"\"'])",
        )
      ).rows.length,
      0,
    );
    await identity(db, null, "anon");
    assert.ok((await db.query("select * from delivery_zones")).rows.length);
    assert.equal(
      (await db.query("select * from checkout_settings")).rows.length,
      1,
    );
    for (const table of ["orders", "admin_users", "customer_profiles"])
      await assert.rejects(
        db.query(`select * from ${table}`),
        /permission denied/,
      );
    for (const table of [
      "delivery_zones",
      "checkout_settings",
      "customer_profiles",
    ])
      await assert.rejects(db.query(`truncate ${table}`), /permission denied/);
    await assert.rejects(
      db.exec(
        "insert into delivery_zones(name_en,name_ar,fee) values('Attack','هجوم',0)",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("update checkout_settings set cash_enabled=false"),
      /permission denied/,
    );
    await identity(db, customer);
    assert.equal(
      (
        await db.query(
          "update delivery_zones set fee=0 where id=$1 returning id",
          [zone],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update checkout_settings set cash_enabled=false returning id",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        "insert into delivery_zones(name_en,name_ar,fee) values('Attack','هجوم',0)",
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query("delete from delivery_zones where id=$1 returning id", [
          zone,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("insert into checkout_settings(id) values(true)"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("delete from checkout_settings"),
      /permission denied/,
    );
    await identity(db, admin);
    assert.equal(
      (
        await db.query(
          "update checkout_settings set cash_enabled=false returning id",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update delivery_zones set fee=65 where id=$1 returning id",
          [zone],
        )
      ).rows.length,
      1,
    );
    const temporary = crypto.randomUUID();
    await db.query(
      "insert into delivery_zones(id,name_en,name_ar,fee) values($1,'Admin TEST','اختبار',20)",
      [temporary],
    );
    assert.equal(
      (
        await db.query("delete from delivery_zones where id=$1 returning id", [
          temporary,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update admin_notifications set read_at=now() returning id",
        )
      ).rows.length,
      4,
    );
    await assert.rejects(
      db.exec("update admin_notifications set sent_at=now()"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("select private.snapshot_item_cost()"),
      /permission denied/,
    );
    for (const name of backendFunctions) {
      const f = functions.find((f) => f.proname === name)!;
      await assert.rejects(
        db.query(`select public.${name}(${f.args})`),
        /permission denied/,
      );
    }
  } finally {
    await db.close();
  }
});
