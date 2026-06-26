import type { CartLine } from "@/components/providers/CartProvider";
import type { Messages } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/types";
import { getProduct } from "@/lib/products";
import { whatsappLink } from "@/lib/config";

/** Customer delivery details collected at checkout. */
export interface Customer {
  name: string;
  phone: string;
  address: string;
}

/**
 * Build the localized order message from cart lines. The same text powers both
 * the WhatsApp deep link and the Instagram clipboard copy.
 * Loops one bullet per item using the localized product name, appends a subtotal
 * line when any product is priced, and appends the customer's delivery details.
 */
export function buildOrderMessage(
  lines: CartLine[],
  locale: Locale,
  messages: Messages,
  customer?: Customer,
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

  // Delivery details — only the fields the customer actually filled in.
  if (customer) {
    const details: string[] = [];
    if (customer.name.trim()) details.push(`${wa.name}: ${customer.name.trim()}`);
    if (customer.phone.trim()) details.push(`${wa.phone}: ${customer.phone.trim()}`);
    if (customer.address.trim())
      details.push(`${wa.address}: ${customer.address.trim()}`);
    if (details.length) parts.push("", ...details);
  }

  parts.push(wa.closing);
  return parts.join("\n");
}

export function buildOrderLink(
  lines: CartLine[],
  locale: Locale,
  messages: Messages,
  customer?: Customer,
): string {
  return whatsappLink(buildOrderMessage(lines, locale, messages, customer));
}
