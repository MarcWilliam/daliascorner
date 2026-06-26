import type { CartLine } from "@/components/providers/CartProvider";
import type { Messages } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/types";
import { getProduct } from "@/lib/products";
import { whatsappLink } from "@/lib/config";

/**
 * Build the localized WhatsApp order message from cart lines.
 * Loops one bullet per item using the localized product name.
 * If any product has a price, appends a subtotal line automatically.
 */
export function buildOrderMessage(
  lines: CartLine[],
  locale: Locale,
  messages: Messages,
): string {
  const wa = messages.whatsapp;
  const bullets = lines.map((line) => {
    const product = getProduct(line.id);
    const name = product ? product.name[locale] : line.id;
    return wa.line.replace("{name}", name).replace("{qty}", String(line.qty));
  });

  const parts = [wa.greeting, ...bullets];

  // Optional pricing — only shows if a product carries a price.
  const subtotal = lines.reduce((sum, line) => {
    const p = getProduct(line.id);
    return p?.price != null ? sum + p.price * line.qty : sum;
  }, 0);
  if (subtotal > 0) {
    parts.push(`${messages.cart.subtotal}: ${subtotal} ${messages.cart.currency}`);
  }

  parts.push(wa.closing);
  return parts.join("\n");
}

export function buildOrderLink(
  lines: CartLine[],
  locale: Locale,
  messages: Messages,
): string {
  return whatsappLink(buildOrderMessage(lines, locale, messages));
}
