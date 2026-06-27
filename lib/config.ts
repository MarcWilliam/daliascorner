/**
 * Dalia's Corner — site-wide constants.
 * Edit these in ONE place. Anything marked PLACEHOLDER must be filled before launch.
 */

import type { Locale } from "./i18n/types";

/**
 * PLACEHOLDER — real WhatsApp number not provided yet.
 * Format: country code + number, digits only, no "+", spaces, or dashes.
 * Egypt example shape: "201001234567". The deep links below stay broken until
 * this is replaced with the real business number.
 */
export const WHATSAPP_NUMBER = "201000000000"; // TODO: replace with Dalia's Corner WhatsApp number
export const WHATSAPP_NUMBER_IS_PLACEHOLDER = true; // set false once the real number is in

/** Social handles / URLs */
export const INSTAGRAM_HANDLE = "bydaliascorner";
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;
/** Direct "message us" deep link — ig.me opens the Instagram DM thread. */
export const INSTAGRAM_DM_URL = `https://ig.me/m/${INSTAGRAM_HANDLE}`;
/** PLACEHOLDER — drop the real Facebook page URL here to show the FB link. */
export const FACEBOOK_URL = ""; // TODO: e.g. "https://facebook.com/daliascorner"

/**
 * ISO 4217 currency code for structured data (JSON-LD Offer.priceCurrency).
 * Kept separate from the cart's display label (messages.cart.currency), which is
 * free-form copy — schema validity must not depend on a translatable UI string.
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

/**
 * Build a WhatsApp deep link. With a message it pre-fills a URL-encoded body;
 * called with no message it returns the bare contact link (used by the header /
 * hero / footer "message us" CTAs) — the single source of truth for wa.me URLs.
 */
export function whatsappLink(message = ""): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
