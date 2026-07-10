import { asset } from "./asset";
import type { LocalizedText } from "./i18n/types";

export type ProductId =
  | "bahira"
  | "zouzou"
  | "shawkat"
  | "shokreya"
  | "zaghloul"
  | "bahgat";

/** Accent token used to theme each character's card (must exist in tailwind config). */
export type AccentToken = "orange" | "clay" | "leaf" | "mauve";

/**
 * Every piece is the same object, so these live in ONE place rather than being
 * repeated on each product: ~15 cm tall, hand-shaped from clay and hand-painted,
 * and shipped already planted with a succulent. Consumed by the product page,
 * the JSON-LD, and llms.txt.
 */
export const POT_HEIGHT_CM = 15;
export const POT_MATERIAL: LocalizedText = {
  en: "hand-painted clay",
  ar: "فخّار متلوّن باليد",
};

export interface Product {
  id: ProductId;
  name: LocalizedText;
  blurb: LocalizedText;
  /**
   * Image path under /public — a real 800×800 hand-painted character photo (WebP),
   * sized for the product card (retina). Swapping it is a one-line edit below.
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
   * OPTIONAL. When set, the card and cart show the price and subtotal. All six
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
 * Single source of truth for the characters. The "Meet the Characters" section,
 * the per-character pages, the cart, the JSON-LD and the Meta catalog feed all
 * read from this array — add a product here and it appears everywhere without
 * touching layout.
 *
 * Bahira, Bahgat and Zaghloul are the three duckling siblings; their blurbs
 * reference each other, so keep that trio in sync if you rename one.
 */
export const PRODUCTS: Product[] = [
  {
    id: "bahira",
    name: { en: "Bahira", ar: "بهيرة" },
    blurb: {
      en: "The eldest of three duckling siblings — sunny and easy-going, happiest with a little water nearby. Big sister to Bahgat and baby Zaghloul.",
      ar: "أكبر تلات إخوات بطّ — دافية وهادية، وأسعد ما تكون لما تلاقي شوية مية جنبها. أخت بهجت الكبيرة وزغلول الصغيّر.",
    },
    image: asset("/products/bahira.webp"),
    thumb: asset("/products/bahira-thumb.webp"),
    alt: {
      en: "Bahira — a cream duckling-shaped clay planter with an orange beak, black dot eyes, and little orange webbed feet.",
      ar: "بهيرة — أصيص فخّار على شكل بطّة كريمي بمنقار برتقالي وعينين سود وأرجل برتقانية صغيّرة.",
    },
    accent: "orange",
    price: 650,
    originalPrice: 800,
  },
  {
    id: "zouzou",
    name: { en: "ZouZou", ar: "زوزو" },
    blurb: {
      en: "A wide-eyed little bunny with rosy cheeks and a hop of curiosity in her — she makes any corner feel softer.",
      ar: "أرنوبة عينيها واسعة وخدودها وردي، وفيها نطّة فضول حلوة — بتخلّي أي ركن أنعم وألطف.",
    },
    image: asset("/products/zouzou.webp"),
    thumb: asset("/products/zouzou-thumb.webp"),
    alt: {
      en: "ZouZou — a cream bunny-shaped clay planter with tall pink-lined ears, big teal eyes, and pink cheeks.",
      ar: "زوزو — أصيص فخّار على شكل أرنب كريمي بودان طويلة وردانية من جوه وعينين خضرا واسعة وخدود وردي.",
    },
    accent: "mauve",
    price: 650,
    originalPrice: 780,
  },
  {
    id: "shawkat",
    name: { en: "Shawkat", ar: "شوكت" },
    blurb: {
      en: "Clever, playful, and a little bit spoiled — this russet fox brings a mischievous spark wherever he sits.",
      ar: "ذكي، لعوب، ومدلّع شوية — الثعلب البرتقاني ده بيجيب شرارة شقاوة لأي مكان يقعد فيه.",
    },
    image: asset("/products/shawkat.webp"),
    thumb: asset("/products/shawkat-thumb.webp"),
    alt: {
      en: "Shawkat — a terracotta-and-cream fox-shaped clay planter with pointed ears, a black nose, and painted whiskers.",
      ar: "شوكت — أصيص فخّار على شكل ثعلب طوبي وكريمي بودان مدببة ومنخار أسود وشوارب مرسومة.",
    },
    accent: "clay",
    price: 600,
    originalPrice: 740,
  },
  {
    id: "shokreya",
    name: { en: "Shokreya", ar: "شكرية" },
    blurb: {
      en: "Calm, sweet, and forever half-asleep — she brightens a spot without ever making a fuss.",
      ar: "هادية، لطيفة، ونصّها نايم على طول — بتنوّر المكان من غير ولا دوشة.",
    },
    image: asset("/products/shokreya.webp"),
    thumb: asset("/products/shokreya-thumb.webp"),
    alt: {
      en: "Shokreya — a mustard-yellow clay planter with a calm, sleeping face.",
      ar: "شكرية — أصيص فخّار أصفر خردلي بوجه هادي ونعسان.",
    },
    accent: "leaf",
    price: 500,
    originalPrice: 600,
  },
  {
    id: "zaghloul",
    name: { en: "Zaghloul", ar: "زغلول" },
    blurb: {
      en: "Fresh out of the shell and brand new to everything — the baby of the duckling trio, tucked up between Bahira and Bahgat.",
      ar: "لسه فاقس وطالع من قشرته، وكل حاجة جديدة عليه — أصغر واحد في التلاتة، مدلّع بين بهيرة وبهجت.",
    },
    image: asset("/products/zaghloul.webp"),
    thumb: asset("/products/zaghloul-thumb.webp"),
    alt: {
      en: "Zaghloul — a clay planter shaped like a yellow chick hatching from a white eggshell, with an orange beak and feet.",
      ar: "زغلول — أصيص فخّار على شكل كتكوت أصفر بيفقس من قشرة بيضة بيضا، بمنقار وأرجل برتقانية.",
    },
    accent: "orange",
    price: 650,
    originalPrice: 850,
  },
  {
    id: "bahgat",
    name: { en: "Bahgat", ar: "بهجت" },
    blurb: {
      en: "His name means “joy”, and he means it — the sunny middle duckling of the trio, brother to Bahira and little Zaghloul.",
      ar: "اسمه بهجت وهو فعلاً بهجة — البطّة الوسطانية المشمسة في التلاتة، أخو بهيرة وزغلول الصغيّر.",
    },
    image: asset("/products/bahgat.webp"),
    thumb: asset("/products/bahgat-thumb.webp"),
    alt: {
      en: "Bahgat — a bright yellow duckling-shaped clay planter with an orange beak, black eyes, and orange webbed feet.",
      ar: "بهجت — أصيص فخّار على شكل بطّة صفرا زاهية بمنقار برتقالي وعينين سود وأرجل برتقانية.",
    },
    accent: "mauve",
    price: 650,
    originalPrice: 800,
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
