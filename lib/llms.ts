/**
 * The public llms.txt — a plain-text brand + catalog brief for AI answer
 * engines (the llms.txt convention). Built at build time from the SAME single
 * sources of truth as the rest of the site: PRODUCTS, POT_*, and config. The
 * old public/llms.txt was hand-written, so every price change or new character
 * had to be copied here by hand and quietly drifted; this can't.
 *
 * Emitted by app/llms.txt/route.ts. English only — it's the English-surfacing
 * layer of the bilingual site (the AR copy lives in the UI).
 */
import { PRODUCTS, POT_HEIGHT_CM, POT_MATERIAL, type Product } from "./products";
import {
  SITE_ORIGIN,
  PRICE_CURRENCY,
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  FACEBOOK_URL,
  WHATSAPP_NUMBER,
  WHATSAPP_NUMBER_IS_PLACEHOLDER,
  productUrl,
} from "./config";

/** "650 EGP (originally 800 EGP)." — mirrors the card; "Price on request." when unpriced. */
function priceLine(p: Product): string {
  if (p.price == null) return "Price on request.";
  const onSale = p.originalPrice != null && p.originalPrice > p.price;
  return onSale
    ? `${p.price} ${PRICE_CURRENCY} (originally ${p.originalPrice} ${PRICE_CURRENCY}).`
    : `${p.price} ${PRICE_CURRENCY}.`;
}

/** alt text with its leading "Name — " prefix dropped and first letter capitalised. */
function visual(p: Product): string {
  const stripped = p.alt.en.replace(new RegExp(`^${p.name.en}\\s*[—-]\\s*`), "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** One catalog bullet: linked name, Arabic name, look, personality, price. */
function characterLine(p: Product): string {
  return `- [${p.name.en}](${productUrl(p.id)}) (${p.name.ar}) — ${visual(p)} ${p.blurb.en} ${priceLine(p)}`;
}

/**
 * Human-readable WhatsApp number derived from the config digits
 * ("201016979667" → "+20 101 697 9667"). Egyptian mobiles are 10 national
 * digits after the 20 country code, grouped 3-3-4; any other length falls back
 * to the raw national part so a re-numbered business never prints garbage.
 */
function prettyWhatsApp(): string {
  const nat = WHATSAPP_NUMBER.startsWith("20")
    ? WHATSAPP_NUMBER.slice(2)
    : WHATSAPP_NUMBER;
  const grouped =
    nat.length === 10
      ? `${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`
      : nat;
  return `+20 ${grouped}`;
}

export function buildLlmsTxt(): string {
  const site = `${SITE_ORIGIN}/`;
  const privacy = `${SITE_ORIGIN}/privacy/`;

  // Order matches the site's own contact policy (see lib/jsonld.ts): never
  // publish a placeholder WhatsApp number or an unset Facebook URL.
  const orderLines = [
    "- There is no online payment or checkout. Orders are arranged by direct message.",
    '- On the website you can add characters to a cart and "check out" — this opens a pre-filled WhatsApp (or Instagram) message with the chosen list, and the details and delivery are settled in chat.',
    `- You can also message directly on Instagram (@${INSTAGRAM_HANDLE}) or WhatsApp to order, ask about a custom color/design, or arrange delivery.`,
    ...(WHATSAPP_NUMBER_IS_PLACEHOLDER ? [] : [`- WhatsApp: ${prettyWhatsApp()}.`]),
  ];

  const links = [
    `- [Website](${site})`,
    `- [Instagram](${INSTAGRAM_URL})`,
    ...(FACEBOOK_URL ? [`- [Facebook](${FACEBOOK_URL})`] : []),
    `- [Privacy & tracking](${privacy})`,
  ];

  return `# Dalia's Corner

> Dalia's Corner (Arabic: ركن داليا — "A Little Corner of Love") is a small family business in Egypt that makes handmade, hand-painted pottery planters shaped like cute animal characters. Each piece is shaped from clay and painted by hand by Mama Dalia and her daughters, so no two are alike. Every planter arrives already planted with an easy-care succulent and a care card.

## About
- Brand: Dalia's Corner (Arabic: ركن داليا).
- Tagline: "A Little Corner of Love."
- What it is: a family-run pottery studio in Egypt. Mama Dalia, her daughters, and family shape and hand-paint each piece together.
- Product type: handmade ceramic/pottery planters (plant pots / succulent pots) shaped like animal characters. Fully handmade and hand-painted; every piece is one-of-a-kind.
- Each pot is about ${POT_HEIGHT_CM} cm tall, made of ${POT_MATERIAL.en}, and ships pre-planted with a low-maintenance succulent plus a care card explaining how to look after it.

## Characters (products)
${PRODUCTS.map(characterLine).join("\n")}
- Bahira, Zaghloul and Bahgat are three duckling siblings.

## Shipping & delivery
- Delivery within Cairo, Egypt. Cost and timing depend on the customer's area and are confirmed when the order is placed.
- Each planter is packed with care to arrive safely, already planted.

## How to order
${orderLines.join("\n")}

## Privacy
- The cart and the name/phone/address a customer types are stored only in that visitor's own browser. The site is static — there is no server and no database — so nothing is transmitted until the customer sends the message themselves.
- A Meta (Facebook) Pixel is loaded only if the visitor explicitly opts in, and can be switched off again from any page. See [Privacy & tracking](${privacy}).

## Links
${links.join("\n")}
`;
}
