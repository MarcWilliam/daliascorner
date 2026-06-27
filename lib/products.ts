import { asset } from "./asset";
import type { LocalizedText } from "./i18n/types";

export type ProductId = "bahira" | "shokat" | "shokareya";

/** Accent token used to theme each character's card (must exist in tailwind config). */
export type AccentToken = "orange" | "clay" | "leaf";

export interface Product {
  id: ProductId;
  name: LocalizedText;
  blurb: LocalizedText;
  /**
   * Image path under /public — a real 800×800 hand-painted character photo (WebP).
   * Swapping the photo is a one-line edit on each product below.
   */
  image: string;
  /** Bilingual alt text — describes the planter for screen readers / SEO. */
  alt: LocalizedText;
  accent: AccentToken;
  /**
   * OPTIONAL. Omitted on purpose — the cart is a "request these pieces" list and
   * pricing/shipping is settled in chat. Fill this (e.g. price: 250) and the cart
   * automatically shows per-item price + subtotal. Currency label lives in the dictionaries.
   */
  price?: number;
  /**
   * OPTIONAL "was" price. When set above `price`, the card and cart show it
   * struck through to signal a discount (and the cart sums the total savings).
   */
  originalPrice?: number;
}

/**
 * Single source of truth for the characters. The "Meet the Characters" section
 * and the cart both read from this array — add a product here and it appears in
 * both without touching layout.
 */
export const PRODUCTS: Product[] = [
  {
    id: "bahira",
    name: { en: "Bahira the Duck", ar: "بحيرة البطة" },
    blurb: {
      en: "Cheerful and loves water, she brings joy to any corner she sits in.",
      ar: "مرحة وبتحب المياه، بتجيب البهجة لأي ركن تقعد فيه.",
    },
    image: asset("/products/bahira.webp"),
    alt: {
      en: "Bahira — a cream duck-shaped pottery planter with an orange beak and feet.",
      ar: "بحيرة — أصيص فخّار على شكل بطة كريمي بمنقار وأرجل برتقالية.",
    },
    accent: "orange",
    price: 650,
    originalPrice: 750,
  },
  {
    id: "shokat",
    name: { en: "Shokat the Fox", ar: "شوكت الثعلب" },
    blurb: {
      en: "Clever, playful, and a little spoiled, he brings life to your plants.",
      ar: "ذكي، لعوب، ومدلّع شوية، بيجيب الحياة لنباتاتك.",
    },
    image: asset("/products/shokat.webp"),
    alt: {
      en: "Shokat — a terracotta-and-cream fox pottery planter with pointed ears, a white snout, and whiskers.",
      ar: "شوكت — أصيص فخّار على شكل ثعلب من الطين والكريمي بودان مدببة وخطم أبيض وشوارب.",
    },
    accent: "clay",
    price: 650,
    originalPrice: 750,
  },
  {
    id: "shokareya",
    name: { en: "Shokareya", ar: "شكرية" },
    blurb: {
      en: "Calm and sweet, she brightens any spot without making a fuss.",
      ar: "هادية ولطيفة، بتنوّر أي مكان من غير دوشة.",
    },
    image: asset("/products/shokareya.webp"),
    alt: {
      en: "Shokareya — a sage-green pottery planter with a calm, sleepy face.",
      ar: "شكرية — أصيص فخّار بلون أخضر مريمي بوجه هادي ونعسان.",
    },
    accent: "leaf",
    price: 650,
    originalPrice: 750,
  },
];

export function getProduct(id: ProductId): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Hero image — the real lifestyle shot. */
export const HERO_IMAGE = asset("/products/hero.webp");
export const HERO_ALT: LocalizedText = {
  en: "Three handmade Dalia's Corner pottery planters — a duck, a fox, and a sleepy green character — with small plants, in warm light.",
  ar: "ثلاثة أصص فخّار يدوية من Dalia's Corner — بطة وثعلب وشخصية خضراء نعسانة — مع نباتات صغيرة في إضاءة دافية.",
};
