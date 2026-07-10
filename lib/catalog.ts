/**
 * Meta (Commerce Manager) product catalog feed.
 *
 * Emitted at build time from the same PRODUCTS array the site renders, so the
 * catalog can never drift from the shop. Point Commerce Manager at
 * https://daliascorner.com/catalog.csv as a scheduled data feed.
 *
 * Field reference: developers.facebook.com/docs/commerce-platform/catalog/fields
 * - `id` is the same string the cart, the JSON-LD `sku`, and the pixel's
 *   `content_ids` use. One namespace everywhere — a content_id mismatch is the
 *   classic way a Meta catalog silently stops matching events to items.
 * - `price` is the REGULAR price and `sale_price` the discounted one, which is
 *   the inverse of how the UI names them (`originalPrice` / `price`).
 * - `link` must be "the specific product page for the item", which is why
 *   /characters/<id>/ exists at all.
 */
import { PRODUCTS, type Product } from "./products";
import { PRICE_CURRENCY, SITE_ORIGIN, productUrl } from "./config";

/** Meta wants "<amount> <ISO currency>", period decimal, no symbol. */
const money = (amount: number) => `${amount.toFixed(2)} ${PRICE_CURRENCY}`;

/** RFC 4180: quote any field containing a comma, quote or newline. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "brand",
  "product_type",
  "google_product_category",
] as const;

function row(p: Product): string[] {
  // A character with no price cannot be a catalog item — Meta requires one.
  const regular = p.originalPrice ?? p.price!;
  const sale = p.originalPrice != null && p.price! < p.originalPrice ? p.price! : null;

  return [
    p.id,
    p.name.en,
    `${p.blurb.en} ${p.alt.en}`,
    "in stock",
    "new",
    money(regular),
    sale != null ? money(sale) : "",
    productUrl(p.id),
    // p.image is already basePath-prefixed by asset(); prepend the origin.
    `${SITE_ORIGIN}${p.image}`,
    "Dalia's Corner",
    "Home & Garden > Planters",
    "Home & Garden > Lawn & Garden > Gardening > Pots & Planters",
  ];
}

export function buildCatalogCsv(): string {
  const priced = PRODUCTS.filter((p) => p.price != null);
  const lines = [
    COLUMNS.join(","),
    ...priced.map((p) => row(p).map(csvCell).join(",")),
  ];
  // Trailing newline: some feed parsers drop the final record without it.
  return `${lines.join("\n")}\n`;
}
