/**
 * Structured data (schema.org JSON-LD) for the home page.
 *
 * Built from the same single sources of truth as the UI (products, the English
 * dictionary, config) so it never drifts from the visible site. Rendered as
 * <script type="application/ld+json"> in app/layout.tsx, so it lands in the
 * static HTML where search engines and AI answer-engines read it without
 * executing JS — which matters here because the visible English copy is
 * client-rendered. Names/descriptions are in English (the language most AI
 * queries about an Egyptian brand use) with the Arabic name as alternateName.
 */
import { PRODUCTS } from "./products";
import { asset } from "./asset";
import { dictionaries } from "./i18n/dictionaries";
import {
  INSTAGRAM_URL,
  INSTAGRAM_DM_URL,
  FACEBOOK_URL,
  WHATSAPP_NUMBER,
  WHATSAPP_NUMBER_IS_PLACEHOLDER,
  whatsappLink,
} from "./config";

const en = dictionaries.en;

/** Production origin — same default as app/layout.tsx's metadataBase. */
const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://daliascorner.com";

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

const products = PRODUCTS.map((p) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": `${SITE}/#product-${p.id}`,
  name: p.name.en,
  alternateName: p.name.ar,
  description: `${p.blurb.en} ${p.alt.en}`,
  // p.image is already basePath-prefixed by asset(); just prepend the origin.
  image: `${SITE}${p.image}`,
  category: "Planter",
  brand: { "@type": "Brand", name: "Dalia's Corner" },
  // Offer with the real price when one is set; a price-less character (settled in
  // chat) is still a valid Product, just without an Offer.
  ...(p.price != null
    ? {
        offers: {
          "@type": "Offer",
          priceCurrency: en.cart.currency,
          price: String(p.price),
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          url: `${SITE}/#characters`,
          seller: { "@id": ORG_ID },
        },
      }
    : {}),
}));

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE}/#faq`,
  inLanguage: "en",
  mainEntity: en.faq.items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

/** All JSON-LD blocks for the home page, each rendered as its own script tag. */
export const jsonLdBlocks: object[] = [
  organization,
  website,
  ...products,
  faqPage,
];
