import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutAttempt } from "../lib/store/checkout-attempt";
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
