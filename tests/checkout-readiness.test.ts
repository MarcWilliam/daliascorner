import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptExpired } from "../lib/store/order-receipt";
import { checkoutIssue } from "../lib/store/checkout-readiness";
import { parseOrder } from "../lib/store/validation";
import { parseAuthReturn } from "../lib/store/auth-return";
const customer = {
  name: "Test Customer",
  phone: "+20 100 123 4567",
  address: "10 Example Street",
};
test("checkout explains the first incomplete field instead of silently disabling submission", () => {
  assert.equal(checkoutIssue({ name: "", phone: "", address: "" }, ""), "name");
  assert.equal(checkoutIssue({ ...customer, phone: "123" }, ""), "phone");
  assert.equal(checkoutIssue({ ...customer, address: "abc" }, ""), "address");
  assert.equal(checkoutIssue(customer, ""), "zone");
  assert.equal(checkoutIssue(customer, "zone-id"), null);
});
test("customer readiness matches server validation, including misplaced plus signs", () => {
  for (const phone of [
    "1234567+",
    "100+1234567",
    "letters",
    "123",
    "\t12345678",
  ]) {
    const invalid = { ...customer, phone };
    assert.equal(checkoutIssue(invalid, "zone-id"), "phone");
    assert.throws(() =>
      parseOrder({
        customer: invalid,
        key: crypto.randomUUID(),
        locale: "en",
        lines: [{ id: "mug", qty: 1 }],
      }),
    );
  }
});
test("OAuth resumes only local customer routes and rejects external or admin destinations", () => {
  assert.deepEqual(parseAuthReturn({ path: "/", checkout: true }), {
    path: "/",
    checkout: true,
  });
  assert.deepEqual(
    parseAuthReturn({ path: "/characters/bahira/", checkout: true }),
    { path: "/characters/bahira/", checkout: true },
  );
  for (const path of [
    "//evil.example",
    "https://evil.example",
    "/admin/",
    "/account/?next=https://evil.example",
    "/\\evil.example",
  ]) {
    assert.equal(parseAuthReturn({ path, checkout: true }), null);
  }
});

test("paid pending retry remains a valid receipt after the unpaid reservation window", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const elapsed = { status: "pending", payment_status: "unpaid", expires_at: "2026-11-05T12:00:00Z" };
  assert.equal(receiptExpired(elapsed, now), true);
  assert.equal(receiptExpired({ ...elapsed, payment_status: "paid" }, now), false);
  assert.equal(receiptExpired({ ...elapsed, status: "confirmed" }, now), false);
  assert.equal(receiptExpired({ ...elapsed, status: "cancelled", payment_status: "paid" }, now), true);
  assert.equal(receiptExpired({ ...elapsed, status: "expired", payment_status: "paid" }, now), true);
});
