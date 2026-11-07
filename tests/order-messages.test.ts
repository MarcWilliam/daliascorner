import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerWhatsAppNumber,
  customerOrderMessageLink,
  orderActionMessage,
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
test("all bilingual templates carry the public order reference and never promise an automatic refund", () => {
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
test("every customer template includes its supplied private order link in the selected language", () => {
  const link =
    "https://shop.example/order/#order=00000000-0000-4000-8000-000000000005";
  for (const locale of ["en", "ar"] as const)
    for (const template of orderMessageTemplates) {
      const message = orderMessage(template, 5, locale, link);
      assert.ok(message.includes("DC-5"));
      assert.ok(message.endsWith(link));
      assert.equal(
        new URL(
          customerOrderMessageLink("01012345678", message)!,
        ).searchParams.get("text"),
        message,
      );
    }
});

test("action drafts distinguish partial fulfilment and actual money from corrections", () => {
  assert.equal(orderActionMessage("ship", true), "shipment_dispatched");
  assert.equal(orderActionMessage("deliver", true), "shipment_delivered");
  assert.equal(orderActionMessage("cancel", false), "cancelled");
  assert.equal(orderActionMessage("cancel", true), "remaining_cancelled");
  assert.equal(orderActionMessage("payment", false), "payment_received");
  assert.equal(orderActionMessage("refund", true), "refund_recorded");
  assert.equal(orderActionMessage("payment_edit", true), undefined);
  assert.equal(orderActionMessage("undo_shipment", true), undefined);
});
