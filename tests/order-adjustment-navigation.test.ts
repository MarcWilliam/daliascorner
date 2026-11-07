import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOrderAction } from "../lib/store/order-adjustment-navigation";
import type { OrderAdjustmentDetail } from "../lib/store/order-adjustments";

function detail(
  overrides: {
    order?: Partial<OrderAdjustmentDetail["order"]>;
    finance?: Partial<OrderAdjustmentDetail["finance"]>;
    items?: OrderAdjustmentDetail["items"];
    shipments?: OrderAdjustmentDetail["shipments"];
  } = {},
): OrderAdjustmentDetail {
  return {
    order: {
      id: "test",
      order_number: 1,
      revision: 0,
      ops_managed: true,
      status: "confirmed",
      customer_name: "TEST",
      customer_phone: "01000000000",
      customer_address: "Synthetic address",
      locale: "en",
      delivery_zone_id: null,
      subtotal: 100,
      delivery_fee: 20,
      ...overrides.order,
    },
    items: overrides.items ?? [
      {
        id: 1,
        product_id: "test-pot",
        name_en: "Test",
        name_ar: "اختبار",
        quantity: 2,
        unit_price: 50,
        reserved_quantity: 0,
        shipped_quantity: 0,
        delivered_quantity: 0,
        removed_quantity: 0,
        returned_quantity: 0,
        restocked_quantity: 0,
      },
    ],
    shipments: overrides.shipments ?? [],
    returns: [],
    timeline: [],
    notes: [],
    finance: {
      payments: [],
      net_collected: 0,
      balance_due: 120,
      refund_due: 0,
      payment_state: "unpaid",
      ...overrides.finance,
    },
  };
}
test("next action follows fulfilment without forcing payment before dispatch", () => {
  const pending = detail({ order: { status: "pending" } });
  assert.deepEqual(nextOrderAction(pending), {
    kind: "confirm",
    section: "recovery",
    correction: "confirm",
  });
  assert.equal(nextOrderAction(detail()).kind, "ship");
  const shipped = detail({
    order: { status: "shipped" },
    shipments: [{ id: "shipment", lines: [{ item_id: 1, quantity: 2 }] }],
  });
  shipped.items[0].shipped_quantity = 2;
  assert.equal(nextOrderAction(shipped).kind, "deliver");
  shipped.shipments[0].delivered_on = "2026-11-07";
  assert.equal(nextOrderAction(shipped).kind, "payment");
});
test("refunds and expired holds route to safe, applicable controls", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  assert.equal(
    nextOrderAction(detail({ finance: { refund_due: 20 } }), now).kind,
    "refund",
  );
  const expiredHold = detail({
    order: { status: "pending", expires_at: "2026-11-06T12:00:00Z" },
  });
  assert.equal(nextOrderAction(expiredHold, now).kind, "extend");
  expiredHold.finance.net_collected = 20;
  assert.equal(nextOrderAction(expiredHold, now).kind, "confirm");
  assert.equal(
    nextOrderAction(detail({ order: { status: "cancelled" } }), now).kind,
    "reopen",
  );
  assert.equal(
    nextOrderAction(
      detail({ order: { status: "expired", is_historical: true } }),
      now,
    ).kind,
    "history",
  );
});
