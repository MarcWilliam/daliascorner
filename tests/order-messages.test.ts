import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerWhatsAppNumber,
  customerOrderMessageLink,
  orderMessage,
  orderMessageTemplates,
} from "../lib/store/order-messages";
test("customer WhatsApp targets normalize Egyptian and explicit international numbers without guessing malformed recipients", () => {
  for (const phone of [
    "01012345678",
    "+20 (101) 234-5678",
    "00201012345678",
    "201012345678",
    "٠١٠١٢٣٤٥٦٧٨",
  ])
    assert.equal(customerWhatsAppNumber(phone), "201012345678");
  assert.equal(customerWhatsAppNumber("+44 7700 900123"), "447700900123");
  for (const phone of [
    "1012345678",
    "01 123",
    "hello01012345678",
    "+20+1012345678",
    "01012345678 ext 2",
    "+012345678",
    "01012345678\nextra",
    "+2001012345678",
    "+2012345",
  ])
    assert.equal(customerWhatsAppNumber(phone), null);
});
test("all five bilingual templates carry the public order reference and never promise an automatic refund", () => {
  for (const locale of ["en", "ar"] as const)
    for (const template of orderMessageTemplates) {
      const text = orderMessage(template, 725, locale);
      assert.ok(text.includes("DC-725"));
      assert.ok(text.includes("Dalia’s Corner"));
      const link = new URL(customerOrderMessageLink("01012345678", text)!);
      assert.equal(link.pathname, "/201012345678");
      assert.equal(link.searchParams.get("text"), text);
      assert.deepEqual([...link.searchParams.keys()], ["text"]);
    }
  assert.equal(orderMessage("confirmed", NaN, "en"), "");
  assert.equal(customerOrderMessageLink("01012345678", ""), null);
  assert.equal(customerOrderMessageLink("01012345678", "x".repeat(4001)), null);
  assert.equal(customerOrderMessageLink("invalid", "DC-1"), null);
});
