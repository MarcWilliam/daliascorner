import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function setup() {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema private;grant usage on schema public to anon,authenticated,service_role;",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261106205431_checkout_rate_limits.sql",
      "utf8",
    ),
  );
  return db;
}
const key = "a".repeat(64),
  other = "b".repeat(64);
async function take(db: PGlite, hash = key) {
  return (
    await db.query<{ allowed: boolean }>(
      "select consume_checkout_limit($1,3,600) allowed",
      [hash],
    )
  ).rows[0].allowed;
}
test("shared checkout counters allow exactly the limit, isolate keys and reset only after expiry", async () => {
  const db = await setup();
  try {
    assert.deepEqual(
      await Promise.all(Array.from({ length: 8 }, () => take(db))),
      [true, true, true, false, false, false, false, false],
    );
    assert.equal(await take(db, other), true);
    const before = (
      await db.query<{ expires_at: Date }>(
        "select expires_at from private.checkout_rate_limits where key_hash=$1",
        [key],
      )
    ).rows[0].expires_at;
    assert.equal(await take(db), false);
    assert.deepEqual(
      (
        await db.query(
          "select expires_at from private.checkout_rate_limits where key_hash=$1",
          [key],
        )
      ).rows[0],
      { expires_at: before },
    );
    await db.query(
      "update private.checkout_rate_limits set expires_at=clock_timestamp()-interval '1 second' where key_hash=$1",
      [key],
    );
    assert.equal(await take(db), true);
    await db.query(
      "update private.checkout_rate_limits set expires_at=clock_timestamp()-interval '25 hours' where key_hash=$1",
      [other],
    );
    assert.equal(await take(db), true);
    assert.equal(
      (
        await db.query(
          "select * from private.checkout_rate_limits where key_hash=$1",
          [other],
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("checkout limiter rejects malformed keys/settings and grants execution only to backend", async () => {
  const db = await setup();
  try {
    for (const values of [
      ["raw-ip", 3, 600],
      [key, 0, 600],
      [key, 3, 0],
      [key, 3, 86401],
      [null, 3, 600],
    ])
      await assert.rejects(
        db.query("select consume_checkout_limit($1,$2,$3)", values),
        /INVALID_RATE_LIMIT/,
      );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(take(db), /permission denied/);
      await assert.rejects(
        db.query("select * from private.checkout_rate_limits"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(await take(db), true);
  } finally {
    await db.close();
  }
});
