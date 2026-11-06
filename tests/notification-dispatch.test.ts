import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeDispatch,
  allowedPushEndpoint,
  dispatchPush,
  runDispatchWork,
  type PushDevice,
  type PushDispatchDependencies,
  type PushEvent,
} from "../supabase/functions/_shared/push-dispatch";
import {
  dispatchMetaEvents,
  type MetaOrder,
  type MetaQueuedEvent,
} from "../supabase/functions/_shared/meta-dispatch";
const clock = Date.parse("2026-11-06T12:00:00Z");
const device = (suffix: string, user_id = "admin"): PushDevice => ({
  user_id,
  endpoint: `https://web.push.apple.com/${suffix}`,
  p256dh: "synthetic-public",
  auth: "synthetic-auth",
});
const event: PushEvent = {
  id: 42,
  kind: "order",
  lease_token: "synthetic-lease",
  attempts: 8,
};
function pushFixture(
  devices: PushDevice[],
  send: PushDispatchDependencies["send"] = async () => {},
) {
  const state = {
    claims: 0,
    sent: [] as string[],
    pending: [] as string[],
    restoredAttempts: [] as (number | undefined)[],
    removed: [] as string[],
    payloads: [] as string[],
  };
  const deps: PushDispatchDependencies = {
    admins: ["admin"],
    devices,
    now: () => clock,
    claim: async () => {
      state.claims++;
      return [event];
    },
    send: async (device, payload) => {
      state.payloads.push(payload);
      await send(device, payload);
    },
    removeDevice: async (device) => {
      state.removed.push(device.endpoint);
    },
    markSent: async (_event, at) => {
      state.sent.push(at);
    },
    keepPending: async (_event, at, attempts) => {
      state.pending.push(at);
      state.restoredAttempts.push(attempts);
    },
  };
  return { state, deps };
}
test("push is marked sent only after a provider accepts; payload stays generic", async () => {
  const { state, deps } = pushFixture([device("good")]);
  const totals = await dispatchPush(deps);
  assert.deepEqual(totals, {
    claimed: 1,
    accepted: 1,
    sent: 1,
    pending: 0,
    stale: 0,
  });
  assert.deepEqual(state.sent, ["2026-11-06T12:00:00.000Z"]);
  assert.deepEqual(JSON.parse(state.payloads[0]), {
    title: "Dalia’s Corner",
    body: "New order · طلب جديد",
    tag: "store-42",
    url: "/admin/",
  });
});
test("stale-only providers are removed and preserve an unsent event for a re-enrolled device", async () => {
  const { state, deps } = pushFixture(
    [device("stale404"), device("stale410")],
    async (device) => {
      throw { statusCode: device.endpoint.endsWith("404") ? 404 : 410 };
    },
  );
  const totals = await dispatchPush(deps);
  assert.equal(totals.accepted, 0);
  assert.equal(totals.sent, 0);
  assert.equal(totals.stale, 2);
  assert.equal(state.removed.length, 2);
  assert.deepEqual(state.restoredAttempts, [7]);
  assert.deepEqual(state.sent, []);
  assert.deepEqual(state.pending, ["2026-11-06T12:05:00.000Z"]);
  const retry = pushFixture([device("reenrolled")]);
  await dispatchPush(retry.deps);
  assert.equal(retry.state.sent.length, 1);
  assert.equal(
    JSON.parse(retry.state.payloads[0]).tag,
    JSON.parse(state.payloads[0]).tag,
  );
});
test("accepted plus transient failure retains pending status and a stable tag across retry", async () => {
  let fail = true;
  const { state, deps } = pushFixture(
    [device("good"), device("retry")],
    async (device) => {
      if (fail && device.endpoint.endsWith("retry")) throw { statusCode: 503 };
    },
  );
  let totals = await dispatchPush(deps);
  assert.equal(totals.accepted, 1);
  assert.equal(totals.sent, 0);
  assert.equal(state.pending.length, 1);
  assert.equal(state.removed.length, 0);
  fail = false;
  totals = await dispatchPush(deps);
  assert.equal(totals.sent, 1);
  assert.equal(state.sent.length, 1);
  assert.equal(
    new Set(state.payloads.map((payload) => JSON.parse(payload).tag)).size,
    1,
  );
});
test("accepted plus permanent stale failure can finish after stale cleanup", async () => {
  const { state, deps } = pushFixture(
    [device("good"), device("stale")],
    async (device) => {
      if (device.endpoint.endsWith("stale")) throw { statusCode: 410 };
    },
  );
  const totals = await dispatchPush(deps);
  assert.equal(totals.sent, 1);
  assert.equal(state.removed.length, 1);
  assert.equal(state.pending.length, 0);
});
test("no usable admin device preserves attempts and rejects endpoint spoofing", async () => {
  const { state, deps } = pushFixture([
    device("other", "customer"),
    {
      ...device("invalid"),
      endpoint: "https://web.push.apple.com.attacker.test/path",
    },
  ]);
  assert.equal((await dispatchPush(deps)).claimed, 0);
  assert.equal(state.claims, 0);
  for (const endpoint of [
    "http://web.push.apple.com/a",
    "https://user@web.push.apple.com/a",
    "https://web.push.apple.com:8443/a",
    "https://127.0.0.1/a",
    "not a URL",
  ])
    assert.equal(allowedPushEndpoint(endpoint), false);
});
test("background acknowledgement returns 202 before dispatch completes", async () => {
  let release!: () => void;
  let started = false;
  let background!: Promise<unknown>;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = acknowledgeDispatch(
    (work) => {
      background = work;
    },
    async () => {
      started = true;
      await blocker;
    },
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(started, true);
  let done = false;
  void background.then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  release();
  await background;
  assert.equal(done, true);
});
test("slow or failed Meta dispatch cannot block an independent push task", async () => {
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pushed = false;
  const failures: string[] = [];
  const work = runDispatchWork(
    async () => {
      pushed = true;
    },
    async () => {
      await slow;
      throw new Error("must not be logged");
    },
    (worker) => failures.push(worker),
  );
  await Promise.resolve();
  assert.equal(pushed, true);
  assert.deepEqual(failures, []);
  release();
  await work;
  assert.deepEqual(failures, ["meta"]);
  const run: string[] = [];
  await runDispatchWork(
    async () => {
      throw Error("private endpoint");
    },
    async () => {
      run.push("meta");
    },
    (worker) => run.push(worker),
  );
  assert.deepEqual(run, ["meta", "push"]);
});
const queued: MetaQueuedEvent = {
  id: "synthetic-order:Purchase",
  order_id: "synthetic-order",
  event_name: "Purchase",
  event_time: new Date(clock).toISOString(),
  lease_token: "test-lease",
};
function metaOrder(payment_status = "paid", status = "confirmed"): MetaOrder {
  return {
    source_url: "https://example.test/",
    marketing_consent: true,
    customer_phone: "01000000000",
    subtotal: 200,
    delivery_fee: 50,
    status,
    payment_status,
    meta_context: {},
    order_items: [{ product_id: "test-pot", quantity: 2, unit_price: 100 }],
  };
}
async function metaFixture(order: MetaOrder, event = queued) {
  const sent: Record<string, unknown>[] = [];
  const stopped: string[] = [];
  const completed: string[] = [];
  const totals = await dispatchMetaEvents([event], {
    loadOrder: async () => order,
    send: async (payload) => {
      sent.push(payload);
    },
    stop: async (event) => {
      stopped.push(event.id);
    },
    complete: async (event) => {
      completed.push(event.id);
    },
  });
  return { totals, sent, stopped, completed };
}
test("Meta Purchase uses current paid state and stops reversals, refunds and invalid lifecycle states before provider send", async () => {
  for (const order of [
    metaOrder("unpaid"),
    metaOrder("refunded"),
    metaOrder("paid", "cancelled"),
    metaOrder("paid", "expired"),
    { ...metaOrder(), marketing_consent: false },
  ]) {
    const result = await metaFixture(order);
    assert.equal(result.sent.length, 0);
    assert.equal(result.stopped.length, 1);
    assert.equal(result.completed.length, 0);
    assert.equal(result.totals.skipped, 1);
  }
  const result = await metaFixture(metaOrder());
  assert.equal(result.sent.length, 1);
  assert.equal(result.completed.length, 1);
  assert.deepEqual(result.sent[0].custom_data, {
    currency: "EGP",
    value: 250,
    content_type: "product",
    contents: [{ id: "test-pot", quantity: 2, item_price: 100 }],
  });
  assert.equal(JSON.stringify(result.sent).includes("01000000000"), false);
});
test("Meta Lead remains independent of payment, while provider failures retain retry eligibility", async () => {
  assert.equal(
    (await metaFixture(metaOrder("unpaid"), { ...queued, event_name: "Lead" }))
      .sent.length,
    1,
  );
  let completed = false;
  const totals = await dispatchMetaEvents([queued], {
    loadOrder: async () => metaOrder(),
    send: async () => {
      throw Error("sensitive provider response");
    },
    stop: async () => {},
    complete: async () => {
      completed = true;
    },
  });
  assert.equal(completed, false);
  assert.deepEqual(totals, { sent: 0, skipped: 0, failed: 1 });
});

test("Meta contents reflect removed and returned quantities and skip fully reversed orders", async () => {
  const order = metaOrder();
  order.order_items = [
    {
      product_id: "old",
      quantity: 4,
      removed_quantity: 1,
      returned_quantity: 1,
      unit_price: 100,
    },
    { product_id: "replacement", quantity: 1, unit_price: 50 },
  ];
  order.subtotal = 250;
  const result = await metaFixture(order);
  const custom = result.sent[0].custom_data as {
    contents: { id: string; quantity: number }[];
    value: number;
  };
  assert.equal(custom.value, 300);
  assert.deepEqual(
    custom.contents.map((i) => ({ id: i.id, quantity: i.quantity })),
    [
      { id: "old", quantity: 2 },
      { id: "replacement", quantity: 1 },
    ],
  );
  order.order_items = [
    {
      product_id: "returned",
      quantity: 2,
      returned_quantity: 2,
      unit_price: 100,
    },
  ];
  order.subtotal = 0;
  order.delivery_fee = 0;
  assert.equal((await metaFixture(order)).sent.length, 0);
});
