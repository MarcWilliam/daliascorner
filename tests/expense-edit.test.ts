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
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && !skipped.has(f))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(`insert into admin_users values('${admin}');`);
  await actor(db, admin);
  const days = (
    await db.query<{ today: string; old: string }>(
      "select (now() at time zone 'Africa/Cairo')::date::text today,((now() at time zone 'Africa/Cairo')::date-2)::text old",
    )
  ).rows[0];
  const id = (
    await db.query<{ v: string }>(
      "select add_finance_entry($1,'marketing',100,'Initial note') v",
      [days.old],
    )
  ).rows[0].v;
  return { db, id, ...days };
}
async function actor(db: PGlite, id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
async function version(db: PGlite, id: string) {
  return (
    await db.query<{ v: string }>(
      "select updated_at::text v from finance_entries where id=$1",
      [id],
    )
  ).rows[0].v;
}
async function edit(
  db: PGlite,
  id: string,
  date: string,
  expected: string,
  category = "shipping",
  amount: number | string = 35,
  note = "Updated note",
) {
  return (
    await db.query<{ v: string }>(
      "select edit_finance_entry($1,$2,$3,$4,$5,$6)::text v",
      [id, date, category, amount, note, expected],
    )
  ).rows[0].v;
}
type Change = {
  old_values: {
    entry_date: string;
    category: string;
    amount: number;
    note: string;
    voided_at: string | null;
  };
  new_values: {
    entry_date: string;
    category: string;
    amount: number;
    note: string;
    voided_at: string | null;
  };
  actor_id: string;
};
async function history(db: PGlite, id: string) {
  return (
    await db.query<{ v: Change[] }>("select finance_entry_history($1) v", [id])
  ).rows[0].v;
}

test("expense editing updates every editable field and filtered finance/category totals while recording old/new values", async () => {
  const { db, id, today, old } = await setup();
  try {
    const before = await version(db, id),
      after = await edit(
        db,
        id,
        today,
        before,
        "shipping",
        35,
        "  Corrected carrier fee  ",
      );
    assert.notEqual(after, before);
    const row = (
      await db.query<{
        entry_date: string;
        category: string;
        amount: number;
        note: string;
        created_by: string;
        voided_at: string | null;
      }>(
        "select entry_date::text,category,amount::float8,note,created_by,voided_at from finance_entries where id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(row, {
      entry_date: today,
      category: "shipping",
      amount: 35,
      note: "Corrected carrier fee",
      created_by: admin,
      voided_at: null,
    });
    const changes = await history(db, id);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].actor_id, admin);
    assert.equal(changes[0].old_values.entry_date, old);
    assert.equal(changes[0].old_values.amount, 100);
    assert.equal(changes[0].new_values.amount, 35);
    const page = (
      await db.query<{
        v: {
          active_total: number;
          category_totals: { category: string; amount: number }[];
          entries: { updated_at: string }[];
        };
      }>("select expense_page($1,$1) v", [today])
    ).rows[0].v;
    assert.equal(page.active_total, 35);
    assert.equal(page.category_totals[0].category, "shipping");
    assert.equal(page.category_totals[0].amount, 35);
    assert.ok(page.entries[0].updated_at);
    const overview = (
      await db.query<{ v: { cash_spent: number; operating_spent: number } }>(
        "select finance_overview($1,$1) v",
        [today],
      )
    ).rows[0].v;
    assert.equal(overview.cash_spent, 35);
    assert.equal(overview.operating_spent, 35);
    assert.equal(
      (
        await db.query<{ v: { active_total: number } }>(
          "select expense_page($1,$1) v",
          [old],
        )
      ).rows[0].v.active_total,
      0,
    );
  } finally {
    await db.close();
  }
});

test("optimistic expense revisions reject stale changes, make exact retries idempotent, and audit voiding without restoring voided entries", async () => {
  const { db, id, today } = await setup();
  try {
    const initial = await version(db, id),
      edited = await edit(db, id, today, initial);
    assert.equal(await edit(db, id, today, initial), edited);
    assert.equal((await history(db, id)).length, 1);
    await assert.rejects(
      edit(db, id, today, initial, "shipping", 36),
      /EXPENSE_CHANGED/,
    );
    assert.equal((await history(db, id)).length, 1);
    await db.query("select void_finance_entry($1)", [id]);
    const voidedVersion = await version(db, id);
    assert.notEqual(voidedVersion, edited);
    assert.equal((await history(db, id)).length, 2);
    await assert.rejects(
      edit(db, id, today, edited, "other", 45),
      /EXPENSE_CHANGED/,
    );
    await edit(
      db,
      id,
      today,
      voidedVersion,
      "other",
      45,
      "Corrected voided record",
    );
    const page = (
      await db.query<{
        v: {
          active_total: number;
          voided_total: number;
          entries: { voided_at: string | null }[];
        };
      }>("select expense_page(null,null,null,'','all') v")
    ).rows[0].v;
    assert.equal(page.active_total, 0);
    assert.equal(page.voided_total, 45);
    assert.ok(page.entries[0].voided_at);
    assert.equal((await history(db, id)).length, 3);
    await db.exec("reset role");
    await assert.rejects(
      db.exec("update private.finance_entry_edits set old_values='{}'"),
      /AUDIT_IMMUTABLE/,
    );
    await assert.rejects(
      db.exec("delete from private.finance_entry_edits"),
      /AUDIT_IMMUTABLE/,
    );
    await assert.rejects(
      db.exec("truncate private.finance_entry_edits"),
      /AUDIT_IMMUTABLE/,
    );
  } finally {
    await db.close();
  }
});

test("expense edit validation and admin access protect corrections and history, including revoked admin sessions", async () => {
  const { db, id, today } = await setup();
  try {
    const expected = await version(db, id);
    for (const amount of [0, -1, 0.001, "NaN", "Infinity", 10000000000])
      await assert.rejects(
        edit(db, id, today, expected, "shipping", amount),
        /INVALID_ENTRY/,
      );
    await assert.rejects(edit(db, id, "infinity", expected), /INVALID_ENTRY/);
    await assert.rejects(edit(db, id, "-infinity", expected), /INVALID_ENTRY/);
    await assert.rejects(edit(db, id, "2999-01-01", expected), /INVALID_ENTRY/);
    await assert.rejects(
      edit(db, id, today, expected, "unknown"),
      /INVALID_ENTRY/,
    );
    await assert.rejects(
      edit(db, id, today, expected, "other", 3, "x".repeat(1001)),
      /INVALID_ENTRY/,
    );
    await assert.rejects(
      edit(db, crypto.randomUUID(), today, expected),
      /ENTRY_NOT_AVAILABLE/,
    );
    assert.equal((await history(db, id)).length, 0);
    await actor(db, "", "anon");
    await assert.rejects(edit(db, id, today, expected), /permission denied/);
    await assert.rejects(history(db, id), /permission denied/);
    await actor(db, customer);
    await assert.rejects(edit(db, id, today, expected), /FORBIDDEN/);
    await assert.rejects(history(db, id), /FORBIDDEN/);
    await assert.rejects(
      db.exec("select * from private.finance_entry_edits"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update finance_entries set amount=1 where id=$1", [id]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query("delete from admin_users where user_id=$1", [admin]);
    await actor(db, admin);
    await assert.rejects(edit(db, id, today, expected), /FORBIDDEN/);
    await assert.rejects(history(db, id), /FORBIDDEN/);
  } finally {
    await db.close();
  }
});
