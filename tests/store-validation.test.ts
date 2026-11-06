import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOrder } from "../lib/store/validation";
const input = {
  key: "00000000-0000-4000-8000-000000000001",
  customer: { name: " Test ", phone: "01000000000", address: " Test address " },
  lines: [{ id: "pot", qty: 1 }],
  locale: "en",
};
test("checkout validates quantities, identities and delivery details", () => {
  assert.equal(parseOrder(input).customer.name, "Test");
  for (const qty of [0, -1, 100, 1.5, "1", null])
    assert.throws(() => parseOrder({ ...input, lines: [{ id: "pot", qty }] }));
  assert.throws(() =>
    parseOrder({ ...input, lines: [...input.lines, ...input.lines] }),
  );
  assert.throws(() =>
    parseOrder({ ...input, customer: { ...input.customer, phone: "abc" } }),
  );
  assert.throws(() => parseOrder({ ...input, key: "invalid" }));
});
test("edge and browser validation stay identical", () => {
  assert.equal(
    readFileSync("lib/store/validation.ts", "utf8"),
    readFileSync("supabase/functions/_shared/validation.ts", "utf8"),
  );
});
