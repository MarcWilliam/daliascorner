import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  instaPayConfigured,
  instaPaySettings,
  normalizeInstaPayNumber,
  validInstaPayLink,
} from "../lib/store/instapay";
const admin = "00000000-0000-4000-8000-000000000001";
const customer = {
  name: "InstaPay TEST",
  phone: "01000000000",
  address: "Synthetic transfer address",
};
const migration = "20261106195502_instapay_payment_details.sql";
const skipped = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup(beforeInstaPay = false) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}');`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        !skipped.has(name) &&
        (!beforeInstaPay || name !== migration),
    )
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into inventory(product_id,name_en,name_ar,price,on_hand) values('pot','Pot','وعاء',100,20);update checkout_settings set transfer_enabled=true,transfer_instructions='Retained legacy note';`,
  );
  const zone = crypto.randomUUID();
  await db.query(
    "insert into delivery_zones(id,name_en,name_ar,fee) values($1,'TEST zone','اختبار',60)",
    [zone],
  );
  return { db, zone };
}
function attempt(zone: string) {
  return { key: crypto.randomUUID(), token: crypto.randomUUID(), zone };
}
async function website(
  db: PGlite,
  a: ReturnType<typeof attempt>,
  method = "transfer",
) {
  return (
    await db.query<{ v: Record<string, unknown> }>(
      "select create_website_order($1,'instapay-hash',$2::jsonb,'[{\"id\":\"pot\",\"qty\":2}]'::jsonb,'en',$3,$4,$5,null,false) v",
      [a.key, JSON.stringify(customer), a.token, a.zone, method],
    )
  ).rows[0].v;
}
test("InstaPay accepts only official HTTPS links and receiving mobile/IPA values", () => {
  assert.equal(
    validInstaPayLink("https://ipn.eg/S/test-shop/instapay/example"),
    true,
  );
  for (const link of [
    "http://ipn.eg/S/shop",
    "https://ipn.eg.evil.test/S/shop",
    "https://evil.test/ipn.eg/S/shop",
    "https://user:pass@ipn.eg/S/shop",
    "https://ipn.eg:443/S/shop",
    "https://ipn.eg/#only",
    "javascript:alert(1)",
  ])
    assert.equal(validInstaPayLink(link), false);
  assert.equal(normalizeInstaPayNumber("+20 (100) 123-4567"), "01001234567");
  assert.equal(normalizeInstaPayNumber("٠١٠١٢٣٤٥٦٧٨"), "01012345678");
  assert.equal(
    instaPayConfigured({ instapay_number: "test-shop@instapay" }),
    true,
  );
  assert.equal(
    instaPayConfigured({
      transfer_instructions: "Send screenshot to WhatsApp12345",
    }),
    false,
  );
  assert.throws(
    () => instaPaySettings({ instapay_number: "12345" }),
    /INVALID_INSTAPAY_NUMBER/,
  );
  for (const address of ["shop name@instapay", "shop+tag@instapay"]) {
    assert.equal(normalizeInstaPayNumber(address), address);
    assert.throws(
      () => instaPaySettings({ instapay_number: address }),
      /INVALID_INSTAPAY_NUMBER/,
    );
  }
});
test("unconfigured legacy transfer intent cannot create new InstaPay orders; COD remains available", async () => {
  const { db, zone } = await setup();
  try {
    await assert.rejects(website(db, attempt(zone)), /INVALID_PAYMENT/);
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from orders"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select reserved n from inventory where product_id='pot'",
        )
      ).rows[0].n,
      0,
    );
    const order = await website(db, attempt(zone), "cash");
    assert.equal(order.payment_method, "cash");
  } finally {
    await db.close();
  }
});
test("new website orders snapshot InstaPay details and retries preserve recipient, total and one reservation", async () => {
  const { db, zone } = await setup();
  try {
    await db.exec(
      "update checkout_settings set instapay_link='https://ipn.eg/S/test-shop/instapay/example',instapay_number='test-shop@instapay',transfer_instructions=''",
    );
    const a = attempt(zone),
      first = await website(db, a);
    assert.equal(first.instapay_number, "test-shop@instapay");
    assert.equal(first.payment_status, "unpaid");
    assert.equal(first.total, 260);
    await db.exec(
      "update checkout_settings set instapay_number='different-shop@instapay',instapay_link='',transfer_enabled=false",
    );
    const retry = await website(db, a);
    assert.equal(retry.instapay_number, "test-shop@instapay");
    assert.equal(retry.instapay_link, first.instapay_link);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select reserved n from inventory where product_id='pot'",
        )
      ).rows[0].n,
      2,
    );
    const guest = (
      await db.query<{ v: Record<string, unknown> }>(
        "select guest_order($1) v",
        [a.token],
      )
    ).rows[0].v;
    assert.equal(guest.instapay_number, "test-shop@instapay");
  } finally {
    await db.close();
  }
});
test("new chat orders snapshot details before paid finance; changing settings never reroutes the order", async () => {
  const { db, zone } = await setup();
  try {
    await db.exec(
      "update checkout_settings set instapay_number='01012345678',transfer_instructions=''",
    );
    const a = attempt(zone);
    const order = (
      await db.query<{ v: Record<string, unknown> }>(
        "select create_chat_order($1,$2,$3::jsonb,'[{\"id\":\"pot\",\"qty\":1}]'::jsonb,'en',$4,'transfer',true) v",
        [a.key, a.token, JSON.stringify(customer), zone],
      )
    ).rows[0].v;
    assert.equal(order.instapay_number, "01012345678");
    assert.equal(order.payment_status, "paid");
    await db.exec(
      "update checkout_settings set instapay_number='different-shop@instapay'",
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select sum(amount)::int n from finance_payment_events where order_id=$1",
          [order.id],
        )
      ).rows[0].n,
      160,
    );
    assert.equal(
      (
        await db.query<{ v: string }>(
          "select instapay_number v from orders where id=$1",
          [order.id],
        )
      ).rows[0].v,
      "01012345678",
    );
  } finally {
    await db.close();
  }
});
test("historical transfers remain recordable without current routing and never infer a current payee", async () => {
  const { db, zone } = await setup();
  try {
    await db.exec(
      "update checkout_settings set instapay_number='current-shop@instapay'",
    );
    const a = attempt(zone);
    const day = (
      await db.query<{ d: string }>(
        "select (now() at time zone 'Africa/Cairo')::date::text d",
      )
    ).rows[0].d;
    const past = (
      await db.query<{ v: Record<string, unknown> }>(
        "select create_past_chat_order($1,$2,$3::jsonb,'[{\"id\":\"pot\",\"qty\":1}]'::jsonb,'en',$4,'transfer',$5,true,$5,'already_accounted',160) v",
        [a.key, a.token, JSON.stringify(customer), zone, day],
      )
    ).rows[0].v;
    assert.equal(
      (
        await db.query<{ v: string | null }>(
          "select instapay_number v from orders where id=$1",
          [past.id],
        )
      ).rows[0].v,
      null,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from admin_notifications where order_id=$1",
          [past.id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("database rejects unsafe recipient values", async () => {
  const { db } = await setup();
  try {
    for (const link of [
      "https://evil.test/pay",
      "https://ipn.eg:443/S/shop",
      "https://user@ipn.eg/S/shop",
      "https://ipn.eg/#only",
    ])
      await assert.rejects(
        db.query("update checkout_settings set instapay_link=$1", [link]),
        /checkout_instapay_link_format/,
      );
    for (const number of ["12345", "shop@evil.test", "+201001234567"])
      await assert.rejects(
        db.query("update checkout_settings set instapay_number=$1", [number]),
        /checkout_instapay_number_format/,
      );
  } finally {
    await db.close();
  }
});

test("legacy transfer orders retain their original routing and are never backfilled from current settings", async () => {
  const { db, zone } = await setup(true);
  try {
    const a = attempt(zone);
    await website(db, a);
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    await db.exec(
      "update checkout_settings set instapay_number='new-recipient@instapay'",
    );
    const old = (
      await db.query<{
        id: string;
        instapay_number: string | null;
        instapay_link: string | null;
        transfer_instructions: string;
      }>(
        "select id,instapay_number,instapay_link,transfer_instructions from orders where idempotency_key=$1",
        [a.key],
      )
    ).rows[0];
    await db.query("select set_order_payment($1,'paid')", [old.id]);
    assert.equal(old.instapay_number, null);
    assert.equal(old.instapay_link, null);
    assert.equal(old.transfer_instructions, "Retained legacy note");
    assert.equal(
      (
        await db.query<{ v: string | null }>(
          "select instapay_number v from orders where id=$1",
          [old.id],
        )
      ).rows[0].v,
      null,
    );
  } finally {
    await db.close();
  }
});
