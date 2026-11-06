import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderItemProgress,
  orderProgressState,
} from "../lib/store/order-progress";

test("customer progress retains legacy quantities and separates removed/returned units from outstanding shipments", () => {
  assert.equal(orderItemProgress({ quantity: 3 }).billable, 3);
  const progress = orderItemProgress({
    quantity: 5,
    shipped_quantity: 2,
    delivered_quantity: 1,
    removed_quantity: 1,
    returned_quantity: 1,
  });
  assert.equal(progress.billable, 3);
  assert.equal(progress.remaining, 2);
  assert.equal(progress.returned, 1);
  assert.equal(
    orderItemProgress({ quantity: 2, removed_quantity: 2 }).billable,
    0,
  );
});

test("returned shipments and delivered replacements close without double-counting returned deliveries", () => {
  assert.equal(
    orderProgressState(
      [
        { quantity: 2, shipped_quantity: 2, returned_quantity: 2 },
        { quantity: 1, shipped_quantity: 1, delivered_quantity: 1 },
      ],
      "delivered",
    ),
    "delivered",
  );
  assert.equal(
    orderProgressState(
      [
        {
          quantity: 3,
          shipped_quantity: 3,
          delivered_quantity: 2,
          returned_quantity: 2,
          returned_after_delivery_quantity: 2,
        },
      ],
      "shipped",
    ),
    "partially_delivered",
  );
  assert.equal(
    orderProgressState(
      [
        { quantity: 2, shipped_quantity: 2, returned_quantity: 2 },
        { quantity: 1 },
      ],
      "confirmed",
    ),
    "awaiting_replacement",
  );
});
