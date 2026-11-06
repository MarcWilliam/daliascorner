import { WHATSAPP_NUMBER_IS_PLACEHOLDER, whatsappLink } from "../config";
import type { Locale } from "../i18n/types";

/** Only a public order reference is shared; no private tracking link or customer details. */
export function paymentProofWhatsAppLink(
  orderNumber: number,
  locale: Locale,
): string | null {
  if (
    WHATSAPP_NUMBER_IS_PLACEHOLDER ||
    !Number.isSafeInteger(orderNumber) ||
    orderNumber < 1
  )
    return null;
  return whatsappLink(
    locale === "ar"
      ? `إثبات دفع الطلب DC-${orderNumber}.`
      : `Payment screenshot for order DC-${orderNumber}.`,
  );
}
