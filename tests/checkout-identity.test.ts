import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutAttemptForOwner,
  restoreOwnedCheckoutAttempt,
  checkoutRequestScope,
} from "../lib/store/checkout-identity";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("a late previous-owner checkout response cannot save a private link or clear the next checkout's busy state", async () => {
  const scope = checkoutRequestScope();
  let owner = "customer-a";
  const response = deferred<string>();
  const first = scope.begin(owner);
  let privateLink = "",
    busy = true;
  const oldWork = (async () => {
    try {
      const result = await response.promise;
      if (first.current(owner)) privateLink = result;
    } finally {
      if (first.finish(owner)) busy = false;
    }
  })();
  owner = "customer-b";
  scope.invalidateOwner(owner);
  assert.equal(first.signal.aborted, true);
  const next = scope.begin(owner);
  response.resolve("previous customer's private tracking link");
  await oldWork;
  assert.equal(privateLink, "");
  assert.equal(busy, true);
  assert.equal(scope.busy(owner), true);
  assert.equal(next.finish(owner), true);
});
test("sign-out invalidates response commits immediately and superseding a same-owner request preserves the new request", () => {
  const scope = checkoutRequestScope();
  const first = scope.begin("customer-a");
  assert.equal(first.current("guest"), false);
  scope.invalidateOwner("guest");
  assert.equal(first.finish("guest"), false);
  const second = scope.begin("guest");
  const third = scope.begin("guest");
  assert.equal(second.signal.aborted, true);
  assert.equal(second.finish("guest"), false);
  assert.equal(third.current("guest"), true);
});
test("an ambiguous guest order preserves both credentials on sign-in and becomes exclusive to that customer", () => {
  const guest = restoreOwnedCheckoutAttempt(null, null, "basket", "guest", () =>
    crypto.randomUUID(),
  );
  const signedIn = restoreOwnedCheckoutAttempt(
    guest,
    guest,
    "basket",
    "customer-a",
    () => {
      throw Error("must not duplicate an ambiguous guest order");
    },
  );
  assert.equal(signedIn.key, guest.key);
  assert.equal(signedIn.orderToken, guest.orderToken);
  assert.equal(signedIn.owner, "customer-a");
  assert.equal(checkoutAttemptForOwner(signedIn, "guest"), null);
  assert.equal(checkoutAttemptForOwner(signedIn, "customer-b"), null);
  const different = restoreOwnedCheckoutAttempt(
    signedIn,
    signedIn,
    "basket",
    "customer-b",
    () => crypto.randomUUID(),
  );
  assert.notEqual(different.key, signedIn.key);
  assert.notEqual(different.orderToken, signedIn.orderToken);
});
test("matching-owner retries survive stale readable storage and legacy retries retain both credentials", () => {
  const previous = restoreOwnedCheckoutAttempt(
    null,
    null,
    "old basket",
    "customer-a",
    () => crypto.randomUUID(),
  );
  const current = restoreOwnedCheckoutAttempt(
    null,
    previous,
    "new basket",
    "customer-a",
    () => crypto.randomUUID(),
  );
  assert.deepEqual(
    restoreOwnedCheckoutAttempt(
      current,
      previous,
      "new basket",
      "customer-a",
      () => {
        throw Error("must keep memory on quota failure");
      },
    ),
    current,
  );
  const { owner: _owner, ...legacy } = current;
  const restored = restoreOwnedCheckoutAttempt(
    null,
    legacy,
    "new basket",
    "customer-a",
    () => {
      throw Error("legacy retry must not create a second order");
    },
  );
  assert.equal(restored.key, legacy.key);
  assert.equal(restored.orderToken, legacy.orderToken);
  assert.equal(restored.owner, "customer-a");
  assert.equal(checkoutAttemptForOwner(legacy, "guest")?.key, legacy.key);
});
