import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountRequestScope,
  loadCustomerAccount,
} from "../lib/store/customer-account";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("a superseded account request aborts and cannot display the previous account's orders", async () => {
  const scope = accountRequestScope();
  const oldRead = deferred<string[]>();
  const first = scope.begin();
  const oldResult = loadCustomerAccount(
    true,
    false,
    {
      claim: async () => true,
      ownOrders: () => oldRead.promise,
      guestOrder: async () => null,
    },
    first.current,
  );
  const second = scope.begin();
  assert.equal(first.signal.aborted, true);
  const nextResult = await loadCustomerAccount(
    true,
    false,
    {
      claim: async () => true,
      ownOrders: async () => ["new account order"],
      guestOrder: async () => null,
    },
    second.current,
  );
  oldRead.resolve(["old private order"]);
  assert.equal(await oldResult, null);
  assert.deepEqual(nextResult?.orders, ["new account order"]);
});
test("sign-out while guest attachment is pending cannot read orders or commit storage/navigation effects", async () => {
  const scope = accountRequestScope();
  const claim = deferred<boolean>();
  const request = scope.begin();
  let reads = 0,
    commits = 0;
  const work = loadCustomerAccount(
    true,
    true,
    {
      claim: () => claim.promise,
      ownOrders: async () => {
        reads++;
        return ["private order"];
      },
      guestOrder: async () => null,
    },
    request.current,
  ).then((result) => {
    if (result && request.current()) commits++;
  });
  scope.cancel();
  claim.resolve(true);
  await work;
  assert.equal(reads, 0);
  assert.equal(commits, 0);
  assert.equal(request.signal.aborted, true);
});
test("a render-time identity change rejects stale results before effect cleanup", async () => {
  const request = accountRequestScope().begin();
  let identity = "first account";
  const current = () => request.current() && identity === "first account";
  const guest = deferred<string | null>();
  const result = loadCustomerAccount(
    false,
    true,
    {
      claim: async () => true,
      ownOrders: async () => [],
      guestOrder: () => guest.promise,
    },
    current,
  );
  identity = "second account";
  guest.resolve("previous guest private order");
  assert.equal(await result, null);
});
test("successful guest attachment finishes before order read; failed attachment preserves its retry intent", async () => {
  const steps: string[] = [];
  const source = {
    claim: async () => {
      steps.push("claim");
      return true;
    },
    ownOrders: async () => {
      steps.push("read");
      return ["attached order"];
    },
    guestOrder: async () => null,
  };
  const result = await loadCustomerAccount(true, true, source, () => true);
  assert.deepEqual(steps, ["claim", "read"]);
  assert.deepEqual(result, {
    orders: ["attached order"],
    attached: true,
    claimed: true,
    adminPreview: false,
  });
  const failed = await loadCustomerAccount(
    true,
    true,
    { ...source, claim: async () => false },
    () => true,
  );
  assert.equal(failed?.attached, false);
  assert.equal(failed?.claimed, false);
});

test("an admin previews a guest link without claiming it or reading account orders", async () => {
  let claims = 0;
  const result = await loadCustomerAccount(
    true,
    true,
    {
      isAdmin: async () => true,
      claim: async () => {
        claims++;
        return true;
      },
      ownOrders: async () => {
        throw Error("must not read own orders for a guest preview");
      },
      guestOrder: async () => "customer chat order",
    },
    () => true,
  );
  assert.equal(claims, 0);
  assert.deepEqual(result, {
    orders: ["customer chat order"],
    attached: true,
    claimed: false,
    adminPreview: true,
  });
});
test("ordinary customer still claims before reading orders; stale admin checks cannot trigger reads or claims", async () => {
  const steps: string[] = [];
  const result = await loadCustomerAccount(
    true,
    true,
    {
      isAdmin: async () => {
        steps.push("role check");
        return false;
      },
      claim: async () => {
        steps.push("claim");
        return true;
      },
      ownOrders: async () => {
        steps.push("read");
        return ["customer order"];
      },
      guestOrder: async () => {
        throw Error("ordinary customer should attach");
      },
    },
    () => true,
  );
  assert.deepEqual(steps, ["role check", "claim", "read"]);
  assert.equal(result?.claimed, true);
  const role = deferred<boolean>();
  const scope = accountRequestScope();
  const request = scope.begin();
  const pending = loadCustomerAccount(
    true,
    true,
    {
      isAdmin: () => role.promise,
      claim: async () => {
        throw Error("stale role check must not claim");
      },
      ownOrders: async () => {
        throw Error("stale role check must not read");
      },
      guestOrder: async () => {
        throw Error("stale role check must not preview");
      },
    },
    request.current,
  );
  scope.cancel();
  role.resolve(true);
  assert.equal(await pending, null);
});
