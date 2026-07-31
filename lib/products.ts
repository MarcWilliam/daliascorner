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
  | "bondoq"
  | "farawla"
  | "suzy"
  | "bahloul";

export type ProductCategoryId = "signature" | "ultra-small";

/** Accent token used to theme each character's card (must exist in tailwind config). */
export type AccentToken = "orange" | "clay" | "leaf" | "mauve";

/** Shared material; dimensions now live on the category because the two lines differ. */
export const POT_MATERIAL: LocalizedText = catalog.potMaterial;

export interface ProductCategory {
  id: ProductCategoryId;
  eyebrow: LocalizedText;
  name: LocalizedText;
  intro: LocalizedText;
  badge: LocalizedText;
  sizeNote: LocalizedText;
  /** Exact height is intentionally optional until a line's measurement is confirmed. */
  potHeightCm?: number;
}

/** Display order is the JSON order: signature line first, new ultra-small line second. */
export const PRODUCT_CATEGORIES: ProductCategory[] =
  catalog.categories as ProductCategory[];

export interface Product {
  id: ProductId;
  category: ProductCategoryId;
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
   * OPTIONAL. When set, the card and cart show the price and subtotal. Every
   * current character is priced; a character left without a price becomes a
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
 * Single source of truth for the catalog. The raw data lives in
 * products.json (like the i18n dictionaries in lib/i18n/*.json) so a character
 * can be added or edited without touching UI code — this module is just the
 * typed loader. To add a product: add an entry to products.json and its id to
 * the ProductId union above. The category sections, the per-
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

export function getProductCategory(
  id: ProductCategoryId,
): ProductCategory {
  const category = PRODUCT_CATEGORIES.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown product category: ${id}`);
  return category;
}

export function getProductsByCategory(id: ProductCategoryId): Product[] {
  return PRODUCTS.filter((p) => p.category === id);
}

/** Hero image — the real lifestyle shot. */
export const HERO_IMAGE = asset(catalog.hero.image);
export const HERO_ALT: LocalizedText = catalog.hero.alt;
