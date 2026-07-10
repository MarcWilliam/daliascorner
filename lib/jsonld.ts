/**
 * Structured data (schema.org JSON-LD).
 *
 * Built from the same single sources of truth as the UI (products, the English
 * dictionary, config) so it never drifts from the visible site. Rendered as
 * <script type="application/ld+json"> into the static HTML, where search engines
 * and AI answer-engines read it without executing JS — which matters here
 * because the visible English copy is client-rendered. Names/descriptions are in
 * English (the language most AI queries about an Egyptian brand use) with the
 * Arabic name as alternateName.
 *
 * Split three ways by scope, because Google polices FAQPage for visible-content
 * parity and would (rightly) flag an FAQ block on a product page that shows no FAQ:
 *   siteJsonLd     → every page   (layout)
 *   homeJsonLd     → "/"          (products + FAQ, both visible there)
 *   productJsonLd  → "/characters/<id>/"
 */
import { POT_HEIGHT_CM, POT_MATERIAL, PRODUCTS, type Product } from "./products";
import { asset } from "./asset";
import { dictionaries } from "./i18n/dictionaries";
import {
  INSTAGRAM_URL,
  INSTAGRAM_DM_URL,
  FACEBOOK_URL,
  WHATSAPP_NUMBER,
  WHATSAPP_NUMBER_IS_PLACEHOLDER,
  PRICE_CURRENCY,
  DEFAULT_LOCALE,
  SITE_ORIGIN,
  productUrl,
  whatsappLink,
} from "./config";

const en = dictionaries.en;
// The page is statically pre-rendered in DEFAULT_LOCALE, so any schema Google
// checks for visible-content parity (FAQPage) must be built from that locale.
const def = dictionaries[DEFAULT_LOCALE];

const SITE = SITE_ORIGIN;

/** Absolute URL for a /public asset (origin + deploy basePath + path). */
const abs = (path: string) => `${SITE}${asset(path)}`;

const ORG_ID = `${SITE}/#organization`;

/** Instagram, plus Facebook only once a real URL is configured. */
const sameAs = [INSTAGRAM_URL, ...(FACEBOOK_URL ? [FACEBOOK_URL] : [])];

/**
 * Contact channels. Instagram DM is always live; the WhatsApp channel is only
 * advertised once the real business number replaces the placeholder, so we never
 * publish a fake phone number in structured data.
 */
const contactPoint = [
  {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: INSTAGRAM_DM_URL,
    availableLanguage: ["ar", "en"],
  },
  ...(WHATSAPP_NUMBER_IS_PLACEHOLDER
    ? []
    : [
        {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: `+${WHATSAPP_NUMBER}`,
          url: whatsappLink(""),
          availableLanguage: ["ar", "en"],
        },
      ]),
];

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Dalia's Corner",
  alternateName: "ركن داليا",
  url: `${SITE}/`,
  logo: abs("/logo.jpg"),
  image: abs("/og.png"),
  description: en.meta.description,
  slogan: en.hero.wordmarkSub,
  // Currently delivering within Cairo (see the FAQ); the country anchors the brand.
  areaServed: {
    "@type": "City",
    name: "Cairo",
    containedInPlace: { "@type": "Country", name: "Egypt" },
  },
  sameAs,
  contactPoint,
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: `${SITE}/`,
  name: "Dalia's Corner",
  inLanguage: ["ar", "en"],
  publisher: { "@id": ORG_ID },
};

/**
 * One Product node per character. `sku` carries the same id used by the cart,
 * the Meta catalog feed, and the pixel's `content_ids` — one namespace across
 * the whole stack, because a content_id mismatch is the classic way a Meta
 * catalog silently stops matching events to items.
 */
function product(p: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${SITE}/#product-${p.id}`,
    name: p.name.en,
    alternateName: p.name.ar,
    sku: p.id,
    description: `${p.blurb.en} ${p.alt.en}`,
    // p.image is already basePath-prefixed by asset(); just prepend the origin.
    image: `${SITE}${p.image}`,
    url: productUrl(p.id),
    category: "Planter",
    material: POT_MATERIAL.en,
    // Every piece is the same ~15 cm hand-painted clay pot (see lib/products.ts).
    height: {
      "@type": "QuantitativeValue",
      value: POT_HEIGHT_CM,
      unitCode: "CMT",
    },
    brand: { "@type": "Brand", name: "Dalia's Corner" },
    // Offer with the real price when one is set; a price-less character (settled
    // in chat) is still a valid Product, just without an Offer.
    ...(p.price != null
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: PRICE_CURRENCY,
            price: String(p.price),
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            url: productUrl(p.id),
            seller: { "@id": ORG_ID },
          },
        }
      : {}),
  };
}

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE}/#faq`,
  // Must match the FAQ text actually rendered into the static HTML (DEFAULT_LOCALE).
  // Google polices FAQPage for visible-content parity and drops mismatched markup.
  inLanguage: DEFAULT_LOCALE,
  mainEntity: def.faq.items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

/** Site-wide identity — safe on every page. */
export const siteJsonLd: object[] = [organization, website];

/** Home page: the three products and the FAQ are both visible there. */
export const homeJsonLd: object[] = [...PRODUCTS.map(product), faqPage];

/** A single character's page: the Product, plus a trail back to the home page. */
export function productJsonLd(p: Product): object[] {
  return [
    product(p),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Dalia's Corner",
          item: `${SITE}/`,
        },
        { "@type": "ListItem", position: 2, name: p.name.en },
      ],
    },
  ];
}
