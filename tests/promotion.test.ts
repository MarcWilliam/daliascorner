import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isSaleActive, salePricing, SALE_START, SALE_END } from "../lib/promotion";
import { PRODUCTS, getProduct } from "../lib/products";

test("sale includes October 27 through November 2 in Cairo, with exclusive expiry", () => {
  const start = Date.parse(SALE_START), end = Date.parse(SALE_END);
  assert.equal(isSaleActive(start - 1), false);
  assert.equal(isSaleActive(start), true);
  assert.equal(isSaleActive(end - 1), true);
  assert.equal(isSaleActive(end), false);
  assert.equal(isSaleActive(end + 1), false);
});

test("every product and variant gets exactly 20% off and reverts without compounding", () => {
  assert.equal(PRODUCTS.length, 15);
  for (const base of PRODUCTS) {
    const discounted = getProduct(base.id, true)!;
    assert.equal(discounted.price, base.price! * 0.8, base.id);
    assert.equal(discounted.originalPrice, base.price, base.id);
    assert.deepEqual(salePricing(discounted, true), discounted);
    assert.equal(salePricing(discounted, false).price, base.price);
    assert.equal(getProduct(base.id, false)!.originalPrice, undefined);
  }
  assert.deepEqual(salePricing({}, true), {});
});
