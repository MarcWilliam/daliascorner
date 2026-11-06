import { test } from "node:test";
import assert from "node:assert/strict";
import { manualOrderAttempt } from "../lib/store/manual-order-attempt";
test("chat-order timeout retry retains both identifiers despite stale readable storage and quota-failed writes", () => {
  const stale = manualOrderAttempt(null, null, "old order", () =>
    crypto.randomUUID(),
  );
  const first = manualOrderAttempt(null, stale, "current order", () =>
    crypto.randomUUID(),
  );
  for (let retry = 0; retry < 3; retry++) {
    const next = manualOrderAttempt(first, stale, "current order", () => {
      throw Error("must retain retry credentials");
    });
    assert.deepEqual(next, first);
  }
});
test("chat-order reload reuses persisted retry; changed contents and malformed identifiers receive fresh credentials", () => {
  const first = manualOrderAttempt(null, null, "unpaid order", () =>
    crypto.randomUUID(),
  );
  assert.deepEqual(
    manualOrderAttempt(null, first, "unpaid order", () => {
      throw Error("must restore");
    }),
    first,
  );
  const changed = manualOrderAttempt(first, first, "paid order", () =>
    crypto.randomUUID(),
  );
  assert.notEqual(changed.key, first.key);
  assert.notEqual(changed.token, first.token);
  const repaired = manualOrderAttempt(
    null,
    { ...first, token: "invalid" },
    "unpaid order",
    () => crypto.randomUUID(),
  );
  assert.notEqual(repaired.key, first.key);
  assert.notEqual(repaired.token, first.token);
});
