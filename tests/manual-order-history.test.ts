import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cairoDay,
  pastOrderDates,
  originalUnitCost,
  manualOrderPricePreview,
} from "../lib/store/manual-order-history";
test("past sales require original Cairo dates; unpaid sales carry no payment date", () => {
  assert.equal(cairoDay(new Date("2026-11-06T22:30:00Z")), "2026-11-07");
  assert.deepEqual(
    pastOrderDates("2026-10-01", true, "2026-10-03", "2026-11-06"),
    { orderedOn: "2026-10-01", paidOn: "2026-10-03" },
  );
  assert.deepEqual(
    pastOrderDates("2026-10-01", false, "2026-10-03", "2026-11-06"),
    { orderedOn: "2026-10-01", paidOn: null },
  );
  for (const [ordered, paid] of [
    ["", ""],
    ["2026-10-01", ""],
    ["2026-11-07", "2026-11-07"],
    ["2026-10-03", "2026-10-01"],
    ["2026-02-30", "2026-10-03"],
    ["0000-01-01", "2026-10-03"],
  ]) {
    assert.throws(
      () => pastOrderDates(ordered, true, paid, "2026-11-06"),
      /INVALID_DATE/,
    );
  }
});
test("unknown original cost remains omitted and explicit zero remains a known cost", () => {
  assert.equal(originalUnitCost(""), undefined);
  assert.equal(originalUnitCost("  "), undefined);
  assert.equal(originalUnitCost("0"), 0);
  assert.equal(originalUnitCost("12.50"), 12.5);
  for (const cost of ["-1", "NaN", "Infinity", "12.001", "10000000000"])
    assert.throws(() => originalUnitCost(cost), /INVALID_COST/);
});
test("original-price confirmation changes with items, quantities, prices or zone even when total is unchanged", () => {
  const prices = { pot: 0.1, planter: 0.2 };
  const first = manualOrderPricePreview([{ id: "pot", qty: 1 }], prices, {
    id: "zone-a",
    fee: 0.2,
  });
  assert.equal(first.total, 0.3);
  assert.equal(first.subtotal, 0.1);
  assert.notEqual(
    first.confirmationKey,
    manualOrderPricePreview([{ id: "pot", qty: 2 }], prices, {
      id: "zone-a",
      fee: 0.2,
    }).confirmationKey,
  );
  assert.notEqual(
    first.confirmationKey,
    manualOrderPricePreview([{ id: "planter", qty: 1 }], prices, {
      id: "zone-a",
      fee: 0.1,
    }).confirmationKey,
  );
  assert.notEqual(
    first.confirmationKey,
    manualOrderPricePreview(
      [{ id: "pot", qty: 1 }],
      { ...prices, pot: 0.2 },
      { id: "zone-a", fee: 0.1 },
    ).confirmationKey,
  );
  assert.notEqual(
    first.confirmationKey,
    manualOrderPricePreview([{ id: "pot", qty: 1 }], prices, {
      id: "zone-b",
      fee: 0.2,
    }).confirmationKey,
  );
});
