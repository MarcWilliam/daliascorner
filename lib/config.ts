/**
 * Dalia's Corner — site-wide constants.
 * Edit these in ONE place.
 */

import type { Locale } from "./i18n/types";
import type { ProductId } from "./products";

/**
 * Production origin — single source of truth. app/layout.tsx, lib/jsonld.ts,
 * app/sitemap.ts and the Meta catalog feed all build absolute URLs from it.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://daliascorner.com";

/**
 * WhatsApp business number: country code + number, digits only, no "+".
 * +20 101 697 9667 → drop the "+", drop the local leading zero → 20 1016979667.
 */
export const WHATSAPP_NUMBER = "201016979667";
export const WHATSAPP_NUMBER_IS_PLACEHOLDER: boolean = false;

/** Social handles / URLs */
export const INSTAGRAM_HANDLE = "bydaliascorner";
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;
/** Direct "message us" deep link — ig.me opens the Instagram DM thread. */
export const INSTAGRAM_DM_URL = `https://ig.me/m/${INSTAGRAM_HANDLE}`;
export const FACEBOOK_URL: string =
  "https://www.facebook.com/profile.php?id=61589868861165";

/**
 * Meta Pixel (Dataset) ID. An empty string disables every tracking code path.
 *
 * The pixel never loads without opt-in consent (see ConsentProvider): Egypt's
 * PDPL requires prior, explicit, revocable consent for trackers, and Meta's
 * Business Tools Terms make notice + consent the business's responsibility.
 */
export const META_PIXEL_ID: string = "1574733761109578";

/**
 * Send SHA-256-hashed phone + name to Meta as Advanced Matching on the checkout
 * Lead event. A hashed phone is pseudonymized, NOT anonymous — still personal
 * data, and sending it to Meta (US) is a cross-border transfer. It only ever
 * fires after the visitor opts in, and /privacy names Meta as a recipient.
 * Set false to send nothing but the pseudonymous external_id.
 */
export const META_ADVANCED_MATCHING: boolean = true;

/**
 * ISO 4217 currency code for structured data (JSON-LD Offer.priceCurrency) and
 * the Meta catalog feed. Kept separate from the cart's display label
 * (messages.cart.currency), which is free-form copy — schema and feed validity
 * must not depend on a translatable UI string.
 */
export const PRICE_CURRENCY = "EGP";

/** i18n defaults */
export const DEFAULT_LOCALE: Locale = "ar"; // flip to "en" here to change the default
export const LOCALES: Locale[] = ["ar", "en"];
export const ENABLE_BROWSER_LOCALE_DETECTION = true;

/**
 * Element id for the runtime-injected <meta name="google" content="notranslate">.
 * The site is a single-URL bilingual page statically pre-rendered in DEFAULT_LOCALE;
 * when a visitor resolves to a different locale, the first paint still shows the
 * baseline language until React swaps the text — so we flag the page notranslate to
 * stop the browser offering to translate content the app renders itself.
 */
export const NO_TRANSLATE_ID = "x-no-translate";

/** localStorage keys */
export const STORAGE_LOCALE = "dalias-corner.locale";
export const STORAGE_CART = "dalias-corner.cart";
export const STORAGE_CUSTOMER = "dalias-corner.customer";
export const STORAGE_CONSENT = "dalias-corner.consent";
/** Session-only: the visitor hid the floating promo seal (resets next visit). */
export const STORAGE_PROMO_DISMISSED = "dalias-corner.promo-dismissed";
/** Random per-browser id sent to Meta as external_id. Pseudonymous, never PII. */
export const STORAGE_EXTERNAL_ID = "dalias-corner.eid";

/**
 * Per-product page path. These pages exist so the Meta catalog feed's `link`
 * field can point at "the specific product page for the item" (Meta's spec)
 * and so an ad can land on the character it advertised. trailingSlash: true.
 */
export function productPath(id: ProductId): string {
  return `/characters/${id}/`;
}

/** Absolute per-product URL — feed, JSON-LD, sitemap, OG tags. */
export function productUrl(id: ProductId): string {
  return `${SITE_ORIGIN}${productPath(id)}`;
}

/**
 * Build a WhatsApp deep link. With a message it pre-fills a URL-encoded body;
 * called with no message it returns the bare contact link (used by the header /
 * hero / footer "message us" CTAs) — the single source of truth for wa.me URLs.
 */
export function whatsappLink(message = ""): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
