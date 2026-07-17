import { asset } from "./asset";
import type { LocalizedText } from "./i18n/types";
import catalog from "./products.json";

export type ProductId =
  | "bahira"
  | "zouzou"
  | "shawkat"
  | "shokreya"
  | "zaghloul"
  | "bahgat"
  | "bondoq";

/** Accent token used to theme each character's card (must exist in tailwind config). */
export type AccentToken = "orange" | "clay" | "leaf" | "mauve";

/**
 * Every piece is the same object, so these live in ONE place rather than being
 * repeated on each product: ~15 cm tall, hand-shaped from clay and hand-painted,
 * and shipped already planted with a succulent. Consumed by the product page,
 * the JSON-LD, and llms.txt.
 */
export const POT_HEIGHT_CM: number = catalog.potHeightCm;
export const POT_MATERIAL: LocalizedText = catalog.potMaterial;

export interface Product {
  id: ProductId;
  name: LocalizedText;
  blurb: LocalizedText;
  /**
   * Image path under /public — a real 800×800 hand-painted character photo (WebP),
   * sized for the product card (retina). Stored in products.json as a plain
   * /public path; asset() prefixes the deploy basePath when the array is built.
   */
  image: string;
  /**
   * 200×200 thumbnail (WebP) for the small surfaces — the hero chips (~44px) and
   * cart rows (~64px). Kept separate from `image` so those eagerly-rendered/
   * preloaded spots ship ~6KB instead of the 800px card file (LCP win).
   */
  thumb: string;
  /** Bilingual alt text — describes the planter for screen readers / SEO. */
  alt: LocalizedText;
  accent: AccentToken;
  /**
   * OPTIONAL. When set, the card and cart show the price and subtotal. All seven
   * characters are priced today; a character left without a price becomes a
   * "request this piece" item settled entirely in chat, and drops out of the
   * Meta catalog feed / pixel value automatically.
   */
  price?: number;
  /**
   * OPTIONAL "was" price. When set above `price`, the card and cart show it
   * struck through to signal a discount (and the cart sums the total savings).
   */
  originalPrice?: number;
}

/**
 * Single source of truth for the characters. The raw data lives in
 * products.json (like the i18n dictionaries in lib/i18n/*.json) so a character
 * can be added or edited without touching this file — this module is just the
 * typed loader. To add a product: add an entry to products.json and its id to
 * the ProductId union above. The "Meet the Characters" section, the per-
 * character pages, the cart, the JSON-LD and the Meta catalog feed all read
 * from this array, so it appears everywhere without touching layout.
 *
 * Bahira, Bahgat and Zaghloul are the three duckling siblings; their blurbs
 * reference each other, so keep that trio in sync if you rename one.
 *
 * The JSON stores image paths as plain /public paths and widens the `id` /
 * `accent` string literals to `string`; the cast narrows them back to their
 * token unions and asset() applies the deploy basePath — both in this one spot.
 */
export const PRODUCTS: Product[] = (catalog.products as Product[]).map((p) => ({
  ...p,
  image: asset(p.image),
  thumb: asset(p.thumb),
}));

export function getProduct(id: ProductId): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Hero image — the real lifestyle shot. */
export const HERO_IMAGE = asset(catalog.hero.image);
export const HERO_ALT: LocalizedText = catalog.hero.alt;
