import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentProofWhatsAppLink } from "../lib/store/payment-proof";
import { WHATSAPP_NUMBER } from "../lib/config";

test("payment proof opens the configured shop with only the localized public order reference", () => {
  for (const locale of ["en", "ar"] as const) {
    const url = new URL(paymentProofWhatsAppLink(725, locale)!);
    assert.equal(url.origin, "https://wa.me");
    assert.equal(url.pathname, `/${WHATSAPP_NUMBER}`);
    assert.deepEqual([...url.searchParams.keys()], ["text"]);
    assert.equal(
      url.searchParams.get("text"),
      locale === "ar"
        ? "إثبات دفع الطلب DC-725."
        : "Payment screenshot for order DC-725.",
    );
  }
});

test("payment proof cannot create a misleading order link from invalid references", () => {
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(paymentProofWhatsAppLink(value, "en"), null);
  }
});
