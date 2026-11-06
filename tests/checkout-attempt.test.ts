import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutAttempt, restoreCheckoutAttempt } from "../lib/store/checkout-attempt";
test("in-memory retry retains order and guest credentials without browser storage", () => {
  const first = checkoutAttempt(null, "basket-a", () => crypto.randomUUID());
  const retry = checkoutAttempt(first, "basket-a", () => {
    throw Error("must not regenerate");
  });
  assert.deepEqual(retry, first);
});
test("changed basket and corrupted saved identifiers start fresh attempts", () => {
  const first = checkoutAttempt(null, "basket-a", () => crypto.randomUUID());
  const changed = checkoutAttempt(first, "basket-b", () => crypto.randomUUID());
  assert.notEqual(changed.key, first.key);
  assert.notEqual(changed.orderToken, first.orderToken);
  const repaired = checkoutAttempt(
    { fingerprint: "basket-a", key: first.key, orderToken: "broken" },
    "basket-a",
    () => crypto.randomUUID(),
  );
  assert.notEqual(repaired.key, first.key);
});

test("readable old storage plus quota-failed writes retains the current retry credentials", () => {
  const stale = checkoutAttempt(null, "old-basket", () => crypto.randomUUID());
  let memory = restoreCheckoutAttempt(null, stale, "new-basket", () => crypto.randomUUID());
  const first = memory;
  // Reads still return stale data after every failed setItem (e.g. full quota).
  for (let retry = 0; retry < 3; retry++) {
    memory = restoreCheckoutAttempt(memory, stale, "new-basket", () => { throw Error("retry must not regenerate"); });
    assert.deepEqual(memory, first);
  }
});
test("reload restores matching persisted attempts and a changed payload starts fresh", () => {
  const stored = checkoutAttempt(null, "saved-basket", () => crypto.randomUUID());
  assert.deepEqual(restoreCheckoutAttempt(null, stored, "saved-basket", () => { throw Error("must restore"); }), stored);
  const changed = restoreCheckoutAttempt(stored, stored, "changed-basket", () => crypto.randomUUID());
  assert.notEqual(changed.key, stored.key);
  assert.notEqual(changed.orderToken, stored.orderToken);
});
