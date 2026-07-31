# Dalia's Corner

A single-page, fully bilingual (Arabic + English, RTL) marketing site for **Dalia's Corner** — handmade, hand-painted pottery planters shaped like animal characters. Built with **Next.js (App Router) + TypeScript + Tailwind CSS**. Claymorphism design system, client-side cart, WhatsApp checkout. No backend, no payment.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Things to fill in (clearly-marked placeholders)

All live in **one place each** — edit and you're done.

| What | Where | Notes |
|------|-------|-------|
| **WhatsApp number** | `lib/config.ts` → `WHATSAPP_NUMBER` | Digits only, country code, no `+`. Also set `WHATSAPP_NUMBER_IS_PLACEHOLDER = false`. |
| **Facebook page URL** | `lib/config.ts` → `FACEBOOK_URL` | Empty by default → the FB link simply doesn't render until set. |
| **Default language** | `lib/config.ts` → `DEFAULT_LOCALE` | `"ar"` (default) or `"en"`. Browser detection toggle: `ENABLE_BROWSER_LOCALE_DETECTION`. |
| **Product photos** | `lib/products.json` → each `image` / `thumb` | Square WebP assets live in `/public/products/` (800×800 and 200×200). |
| **Hero photo** | `lib/products.json` → `hero.image` | Wider lifestyle shot. |
| **OG / share image** | `/public/og.png` + `app/layout.tsx` | Use a 1200×630 image. |
| **Production URL** | `app/layout.tsx` → `metadataBase` | For correct absolute OG/canonical URLs. |

## Adding a product

Append the bilingual entry to [`lib/products.json`](lib/products.json), assign its `category`, then add its id to the `ProductId` union in [`lib/products.ts`](lib/products.ts). It automatically appears in the correct collection, its detail page, cart, sitemap, JSON-LD, Meta catalog feed, and `llms.txt`. In the JSON model, `price` is the current sale price and `originalPrice` is the struck-through regular price.

## Copy / translations

All UI strings live in [`lib/i18n/en.json`](lib/i18n/en.json) and [`lib/i18n/ar.json`](lib/i18n/ar.json). No hardcoded strings in components. An accent word can be wrapped in `*asterisks*` to highlight it (see `RichText`).

## Design tokens

Defined once as CSS variables in [`app/globals.css`](app/globals.css) (`:root`) and exposed as Tailwind utilities in [`tailwind.config.ts`](tailwind.config.ts). Markup never uses raw hex — only tokens (`bg-brand`, `text-ink`, `shadow-clay`, …). All foreground/background pairs are WCAG AA verified.
