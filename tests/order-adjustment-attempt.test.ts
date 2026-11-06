import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustmentAttempt } from "../lib/store/order-adjustments";
test("ambiguous admin adjustment retries retain identity and original revision after a refreshed read", () => {
  let next = 0;
  const uuid = () => `request-${++next}`;
  const original = adjustmentAttempt(
    undefined,
    "payment:120:reference",
    4,
    uuid,
  );
  const retry = adjustmentAttempt(original, "payment:120:reference", 5, uuid);
  assert.deepEqual(retry, original);
  assert.equal(retry.revision, 4);
  assert.equal(next, 1);
  const changed = adjustmentAttempt(original, "payment:150:reference", 5, uuid);
  assert.equal(changed.revision, 5);
  assert.notEqual(changed.key, original.key);
});
