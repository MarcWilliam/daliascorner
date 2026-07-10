/**
 * Meta Pixel — loader, event taxonomy, and Advanced Matching hashing.
 *
 * Two rules govern this file:
 *
 * 1. NOTHING loads or fires until the visitor opts in. `setTrackingEnabled(true)`
 *    is called only by ConsentProvider, and every track* helper is a no-op before
 *    that. fbevents.js is never even requested without consent, because the
 *    request itself sets cookies.
 *
 * 2. THERE IS NO `Purchase` EVENT, and there never can be. Payment is settled in
 *    a WhatsApp / Instagram conversation, off-site. The truthful on-site
 *    conversion is `Lead` — the moment the visitor hands off to chat. Firing a
 *    fabricated Purchase would poison ad optimisation with unverifiable revenue.
 *
 * The taxonomy is therefore: PageView → ViewContent → AddToCart →
 * InitiateCheckout → Lead. Deliberately absent: Purchase, Subscribe,
 * CompleteRegistration, AddPaymentInfo, Search, AddToWishlist (no such surfaces).
 */

import {
  META_ADVANCED_MATCHING,
  META_PIXEL_ID,
  PRICE_CURRENCY,
  STORAGE_EXTERNAL_ID,
} from "./config";
import { getProduct, type Product, type ProductId } from "./products";
import type { CartLine } from "@/components/providers/CartProvider";

type FbqArgs = unknown[];
interface Fbq {
  (...args: FbqArgs): void;
  callMethod?: (...args: FbqArgs) => void;
  queue: FbqArgs[];
  push: Fbq;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Set once by ConsentProvider. Every helper below returns early while false. */
let enabled = false;
let scriptInjected = false;

export const PIXEL_CONFIGURED = META_PIXEL_ID !== "";

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A stable random id for this browser, sent as `external_id`. It is not derived
 * from anything about the person, so it carries no personal data on its own —
 * it just lets Meta stitch a visitor's events together, which is the cheapest
 * available lift to Event Match Quality on a site that collects no email.
 */
function externalId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = window.localStorage.getItem(STORAGE_EXTERNAL_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_EXTERNAL_ID, id);
    }
    return id;
  } catch {
    return undefined; // private mode / storage disabled — events still fire
  }
}

/**
 * One id per user action, passed as `eventID`. Redundant today (there is no
 * Conversions API sending the same event server-side), but it costs nothing and
 * it is the hook a future CAPI integration deduplicates against.
 */
function eventId(): string | undefined {
  try {
    return crypto.randomUUID();
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

/** Meta's stock snippet, minus the automatic `fbq('track','PageView')`. */
function injectPixel() {
  if (scriptInjected || typeof window === "undefined") return;
  scriptInjected = true;

  /* eslint-disable */
  const n: Fbq = (window.fbq = function (...args: FbqArgs) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  } as Fbq);
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  /* eslint-enable */

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);

  window.fbq?.("init", META_PIXEL_ID);
}

/**
 * Called by ConsentProvider. Granting injects the pixel; revoking tells an
 * already-loaded pixel to stop sending (`consent revoke`) and clears the
 * first-party cookies it set. The script itself cannot be un-executed, so a
 * revoking visitor keeps a dormant fbevents.js until their next page load.
 */
export function setTrackingEnabled(next: boolean) {
  if (!PIXEL_CONFIGURED) return;
  enabled = next;

  if (next) {
    injectPixel();
    window.fbq?.("consent", "grant");
    return;
  }

  if (scriptInjected) window.fbq?.("consent", "revoke");
  for (const name of ["_fbp", "_fbc"]) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname}`;
  }
}

function track(event: string, params?: Record<string, unknown>) {
  if (!enabled || !PIXEL_CONFIGURED) return;
  const id = eventId();
  window.fbq?.("track", event, params ?? {}, id ? { eventID: id } : undefined);
}

/* -------------------------------------------------------------------------- */
/* Advanced Matching                                                           */
/* -------------------------------------------------------------------------- */

async function sha256(value: string): Promise<string | undefined> {
  if (!value || typeof crypto === "undefined" || !crypto.subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Meta's phone rule: strip symbols and letters, drop leading zeros, include the
 * country code. Egyptian mobiles are entered every which way — "01016979667",
 * "+20 101 697 9667", "+20 010 1697 9667" (country code AND trunk zero),
 * "0020 101…" — and all of them must land on 201016979667.
 *
 * The country code is peeled off *before* the trunk zero is stripped, so a
 * number that carries both ("2001…") doesn't keep the internal 0. Egyptian
 * national mobile numbers start with 1, never 2, so peeling a leading "20" is
 * unambiguous for this Cairo-only business.
 */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2); // 00 international prefix
  if (d.startsWith("20")) d = d.slice(2); // Egypt country code → national part
  d = d.replace(/^0+/, ""); // national trunk zero
  return d ? `20${d}` : "";
}

/** Meta's name rule: lowercase, no punctuation or digits, no surrounding space. */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^\p{L}\s'-]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Split a free-text name field into Meta's fn / ln. "" when absent. */
export function splitName(raw: string): { fn: string; ln: string } {
  const parts = normalizeName(raw).split(" ").filter(Boolean);
  return { fn: parts[0] ?? "", ln: parts.slice(1).join(" ") };
}

/**
 * Re-`init` the pixel with hashed identifiers so the next event carries them.
 * Meta accepts pre-hashed SHA-256 hex here; hashing in the browser means the
 * raw phone number never leaves the device. `external_id` is passed raw — it is
 * a random UUID, not personal data, and Meta hashes it itself.
 *
 * Awaited before the Lead event so the matching data is attached, not racing it.
 */
export async function setAdvancedMatching(customer: {
  name: string;
  phone: string;
}): Promise<void> {
  if (!enabled || !PIXEL_CONFIGURED) return;

  const eid = externalId();
  const userData: Record<string, string> = {};
  if (eid) userData.external_id = eid;

  if (META_ADVANCED_MATCHING) {
    const { fn, ln } = splitName(customer.name);
    const phone = normalizePhone(customer.phone);

    const [phHash, fnHash, lnHash, ctHash, countryHash] = await Promise.all([
      sha256(phone),
      sha256(fn),
      sha256(ln),
      sha256("cairo"), // the business delivers within Cairo only
      sha256("eg"),
    ]);

    if (phHash) userData.ph = phHash;
    if (fnHash) userData.fn = fnHash;
    if (lnHash) userData.ln = lnHash;
    if (ctHash) userData.ct = ctHash;
    if (countryHash) userData.country = countryHash;
  }

  window.fbq?.("init", META_PIXEL_ID, userData);
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cart lines → Meta's `contents` / `content_ids` / value. Only PRICED products
 * are included: a price-less character (settled entirely in chat) isn't in the
 * catalog feed, so emitting its id as a `content_id` would report an unmatched
 * item, and counting it in `num_items` while it contributes 0 to `value` would
 * understate the basket. Keeping the two consistent means content_ids, contents,
 * num_items and value all describe the same priced subset.
 */
function cartParams(lines: CartLine[]) {
  const priced = lines
    .map((l) => ({ line: l, product: getProduct(l.id) }))
    .filter(
      (x): x is { line: CartLine; product: Product } => x.product?.price != null,
    );

  return {
    content_type: "product",
    content_ids: priced.map((x) => x.line.id),
    contents: priced.map((x) => ({ id: x.line.id, quantity: x.line.qty })),
    num_items: priced.reduce((n, x) => n + x.line.qty, 0),
    value: priced.reduce((sum, x) => sum + (x.product.price ?? 0) * x.line.qty, 0),
    currency: PRICE_CURRENCY,
  };
}

export function trackPageView() {
  track("PageView");
}

export function trackViewContent(product: Product) {
  track("ViewContent", {
    content_type: "product",
    content_ids: [product.id],
    content_name: product.name.en,
    value: product.price ?? 0,
    currency: PRICE_CURRENCY,
  });
}

export function trackAddToCart(id: ProductId) {
  const product = getProduct(id);
  if (!product) return;
  track("AddToCart", {
    content_type: "product",
    content_ids: [id],
    content_name: product.name.en,
    value: product.price ?? 0,
    currency: PRICE_CURRENCY,
  });
}

export function trackInitiateCheckout(lines: CartLine[]) {
  if (!lines.length) return;
  track("InitiateCheckout", cartParams(lines));
}

/**
 * The real conversion this site owns: the visitor leaves for WhatsApp or
 * Instagram carrying an order. Everything after this happens in a chat thread
 * Meta cannot see, which is exactly why this is `Lead` and not `Purchase`.
 */
export async function trackCheckoutLead(
  lines: CartLine[],
  channel: "whatsapp" | "instagram",
  customer: { name: string; phone: string },
) {
  if (!enabled || !PIXEL_CONFIGURED) return;
  try {
    await setAdvancedMatching(customer);
  } catch {
    /* hashing unavailable (no SubtleCrypto) — still send the event */
  }
  track("Lead", { ...cartParams(lines), channel });
}

/** A bare "message us" CTA — no cart attached, so no value. */
export function trackContact(channel: "whatsapp" | "instagram") {
  track("Contact", { channel });
}
