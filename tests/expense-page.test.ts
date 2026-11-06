import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  expensePageArgs,
  defaultExpenseFilters,
} from "../lib/store/expense-page";

const admin = "00000000-0000-4000-8000-000000000001",
  customer = "00000000-0000-4000-8000-000000000002";
const migration = "20261106213620_expense_category_totals.sql";
const hosted = new Set([
  "20261106080241_expiry.sql",
  "20261106083056_notification_cron.sql",
  "20261106092948_meta_dispatch_schedule.sql",
]);
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customer}');`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter(
      (name) => name.endsWith(".sql") && !hosted.has(name) && name <= migration,
    )
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into admin_users values('${admin}');select set_config('request.jwt.claim.sub','${admin}',false);insert into finance_entries(entry_date,category,amount,note,created_by,voided_at) select (now() at time zone 'Africa/Cairo')::date-(g%4),case when g%2=0 then 'marketing' else 'shipping' end,g+1,case when g=0 then '100%_MATCH * literal' else 'Invoice '||g end,'${admin}'::uuid,case when g=0 then now() else null end from generate_series(0,119) g;`,
  );
  return db;
}
type Entry = {
  id: string;
  entry_date: string;
  category: string;
  amount: number;
  note: string;
  voided_at: string | null;
};
type Page = {
  entries: Entry[];
  total_count: number;
  active_count: number;
  voided_count: number;
  active_total: number;
  category_totals: { category: string; amount: number; count: number }[];
  voided_total: number;
  has_more: boolean;
};
async function page(db: PGlite, patch: Record<string, unknown> = {}) {
  const a = { ...expensePageArgs(defaultExpenseFilters(), 0), ...patch };
  return (
    await db.query<{ v: Page }>("select expense_page($1,$2,$3,$4,$5,$6,$7) v", [
      a.p_from,
      a.p_to,
      a.p_category,
      a.p_search,
      a.p_status,
      a.p_offset,
      a.p_limit,
    ])
  ).rows[0].v;
}
test("expense register paginates every entry while exact totals exclude voided spending", async () => {
  const db = await setup();
  try {
    const ids: string[] = [];
    for (const offset of [0, 25, 50, 75, 100]) {
      const result = await page(db, { p_status: "all", p_offset: offset });
      assert.equal(result.total_count, 120);
      assert.equal(result.active_count, 119);
      assert.equal(result.voided_count, 1);
      assert.equal(result.active_total, 7259);
      assert.equal(result.voided_total, 1);
      assert.equal(result.has_more, offset < 100);
      ids.push(...result.entries.map((row) => row.id));
    }
    assert.equal(ids.length, 120);
    assert.equal(new Set(ids).size, 120);
    const active = await page(db);
    assert.equal(active.total_count, 119);
    assert.equal(active.voided_total, 0);
    assert.ok(active.entries.every((row) => row.voided_at === null));
    const voided = await page(db, { p_status: "voided" });
    assert.equal(voided.total_count, 1);
    assert.equal(voided.active_total, 0);
    assert.equal(voided.voided_total, 1);
  } finally {
    await db.close();
  }
});
test("expense dates/categories and literal case-insensitive note search share one aggregate scope", async () => {
  const db = await setup();
  try {
    for (const search of ["%", "_", "*", "match"]) {
      const result = await page(db, { p_status: "all", p_search: search });
      assert.equal(result.total_count, 1);
      assert.equal(result.entries[0].note, "100%_MATCH * literal");
    }
    const rows = (
      await db.query<{
        id: string;
        paid_day: string;
        category: string;
        amount: number;
        note: string;
        voided: boolean;
      }>(
        "select id,entry_date::text as paid_day,category,amount::float amount,note,voided_at is not null voided from finance_entries",
      )
    ).rows;
    const today = (
      await db.query<{ paid_day: string }>(
        "select (now() at time zone 'Africa/Cairo')::date::text as paid_day",
      )
    ).rows[0].paid_day;
    const from = (
      await db.query<{ paid_day: string }>(
        "select ((now() at time zone 'Africa/Cairo')::date-1)::text as paid_day",
      )
    ).rows[0].paid_day;
    const expected = rows.filter(
      (row) =>
        row.paid_day >= from &&
        row.paid_day <= today &&
        row.category === "marketing" &&
        !row.voided &&
        row.note.toLowerCase().includes("invoice 1"),
    );
    const result = await page(db, {
      p_from: from,
      p_to: today,
      p_category: "marketing",
      p_search: " InVOICE 1 ",
    });
    assert.equal(result.total_count, expected.length);
    assert.equal(
      result.active_total,
      expected.reduce((total, row) => total + row.amount, 0),
    );
    assert.deepEqual(
      new Set(result.entries.map((row) => row.id)),
      new Set(expected.map((row) => row.id)),
    );
    for (const patch of [
      { p_from: "infinity" },
      { p_to: "-infinity" },
      { p_from: "2026-02-02", p_to: "2026-01-01" },
      { p_category: "invalid" },
      { p_status: "invalid" },
      { p_search: "x".repeat(201) },
      { p_limit: 101 },
      { p_limit: 0 },
      { p_offset: -1 },
      { p_offset: 1000001 },
    ])
      await assert.rejects(() => page(db, patch));
  } finally {
    await db.close();
  }
});
test("expense register read API denies guest/customer and respects admin revocation", async () => {
  const db = await setup();
  try {
    assert.equal(
      (
        await db.query<{ v: boolean }>(
          "select has_function_privilege('anon','public.expense_page(date,date,text,text,text,integer,integer)','EXECUTE') v",
        )
      ).rows[0].v,
      false,
    );
    await db.exec(
      `set role anon;select set_config('request.jwt.claim.sub','',false);`,
    );
    await assert.rejects(() => page(db), /permission denied/);
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${customer}',false);`,
    );
    await assert.rejects(() => page(db), /FORBIDDEN/);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    assert.equal((await page(db)).total_count, 119);
    await db.exec(
      `reset role;delete from admin_users where user_id='${admin}';set role authenticated;`,
    );
    await assert.rejects(() => page(db), /FORBIDDEN/);
  } finally {
    await db.close();
  }
});

test("expense category totals cover every matched page and exclude voided records", async () => {
  const db = await setup();
  try {
    const first = await page(db, { p_status: "all", p_limit: 1 });
    assert.equal(first.entries.length, 1);
    assert.equal(first.category_totals.length, 2);
    assert.equal(
      first.category_totals.reduce((sum, c) => sum + c.amount, 0),
      first.active_total,
    );
    assert.equal(
      first.category_totals.reduce((sum, c) => sum + c.count, 0),
      119,
    );
    const next = await page(db, { p_status: "all", p_offset: 25, p_limit: 1 });
    assert.deepEqual(next.category_totals, first.category_totals);
    const filtered = await page(db, { p_category: "shipping" });
    assert.equal(filtered.category_totals.length, 1);
    assert.equal(filtered.category_totals[0].category, "shipping");
    assert.equal(filtered.category_totals[0].amount, filtered.active_total);
    const voided = await page(db, { p_status: "voided" });
    assert.deepEqual(voided.category_totals, []);
  } finally {
    await db.close();
  }
});
