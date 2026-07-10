# Meta setup — what lives outside this repo

The code is done. What follows happens in Meta's dashboards. Written for whoever
runs the shop, not for whoever wrote the site.

Everything here was checked against Meta's live documentation on **2026-07-10**.
Meta changes this surface often; re-check anything marked ⚠ before acting on it.

---

## What Meta can and cannot do for this business

**It cannot be the shop.** Native in-app checkout on Facebook and Instagram was
deprecated between June and August 2025 — every Meta "Shop" now just links out to
your website — and it never existed in Egypt anyway. There is no in-chat payment
on any WhatsApp tier in Egypt (that exists only in India, Singapore and Brazil).
Meta has no order-management surface for a pay-in-chat business; the "Orders" tab
only ever served US Checkout shops.

⚠ **Egypt is not on Meta's supported-countries list** for Shops or for Instagram
product tagging. As of the check above, the full experience is US-only, with an
open beta in Canada, Mexico, the UK, Australia, Japan, Korea, Taiwan and
Thailand. Do not build toward shoppable Instagram tags until that changes.

So: Meta is a marketing, discovery and inbox layer. The cart stays in
`lib/products.ts` + `CartProvider`, and the order book stays in WhatsApp.

---

## 1. WhatsApp Business app + catalog (free, highest value)

The one Meta commerce surface actually open to this business.

1. Install **WhatsApp Business** (not regular WhatsApp) on the phone holding
   `+20 101 697 9667`.
2. Settings → Business tools → Catalog. Add the three characters (500-item cap).
3. The catalog is stored in **Meta Commerce Manager**, so it can be edited from a
   desktop at `business.facebook.com` instead of the phone, and the same catalog
   is later shareable with ads.
4. Set a greeting message and away message. Add saved replies for the two
   questions everyone asks: delivery cost, and whether the plant is included.

Note the in-chat cart is **per-conversation** and does not persist. It is a way
to place an order, not a stored basket.

**Do not migrate this number to the WhatsApp Cloud API.** Migration is one-way
and you permanently lose the free Business app on that number. If the Cloud API
is ever needed (for `ctwa_clid` attribution at scale), register a *second*
number for it.

---

## 2. Commerce Manager catalog, fed from this repo

The build emits a Meta-spec feed at **<https://daliascorner.com/catalog.csv>**,
generated from the same `PRODUCTS` array the site renders (see `lib/catalog.ts`).
It cannot drift from the shop.

In Commerce Manager → Catalogue → Data sources → **Scheduled feed**:

- URL: `https://daliascorner.com/catalog.csv`
- Schedule: weekly is plenty for three hand-made SKUs.

Fields it emits: `id`, `title`, `description`, `availability`, `condition`,
`price`, `sale_price`, `link`, `image_link`, `brand`, `product_type`,
`google_product_category`.

Two things worth knowing:

- `price` is the **regular** price (750 EGP) and `sale_price` the discounted one
  (650 EGP). That is the inverse of how the UI names them.
- `id` is `bahira` / `shokat` / `shokareya` — the same string used by the cart,
  the JSON-LD `sku`, and the pixel's `content_ids`. **Never rename these.** A
  `content_id` mismatch is the standard way a Meta catalog silently stops
  matching events to items.

For three SKUs, manual entry in Commerce Manager would also be fine. The feed
exists so nobody has to remember to update two places when a price changes.

---

## 3. The pixel

Dataset ID `1574733761109578`, wired in `lib/meta.ts`.

**It does not load until the visitor clicks "Yes, that's fine."** Egypt's PDPL
requires prior, explicit, revocable consent, and Meta's Business Tools Terms put
the duty to obtain it on the business. Declining, or ignoring the banner, means
`fbevents.js` is never even requested.

Events, in funnel order:

| Event | Fires when |
|---|---|
| `PageView` | consent granted, and on every later page load |
| `ViewContent` | a character's own page opens |
| `AddToCart` | "Add to cart", and the `+` stepper |
| `InitiateCheckout` | the cart drawer opens with something in it |
| `Lead` | the WhatsApp or Instagram checkout button is tapped |
| `Contact` | a bare "message us" CTA is tapped (no cart) |

**There is no `Purchase` event and there cannot be one.** Payment is settled in a
chat thread, off-site. `Lead` is the truthful conversion this site owns. Firing a
fabricated Purchase would poison ad optimisation with revenue nobody can verify.

On the `Lead` event, and only after consent, the visitor's phone number and name
are SHA-256 hashed **in the browser** and sent as Advanced Matching, along with
`ct=cairo` and `country=eg`. Raw values never leave the device. To turn this off,
set `META_ADVANCED_MATCHING = false` in `lib/config.ts`.

To verify: Events Manager → Test Events, or the Meta Pixel Helper extension.
Accept the banner first, or you will correctly see nothing.

---

## 4. Ads — where the test budget should go

The site can never report a sale, because the sale happens in a DM. Do not fight
this by sending paid traffic to the website and optimising for website
conversions. Instead, skip the website:

- **Click-to-Instagram-Direct ads.** Engagement objective → conversion location
  "Messaging apps" → Instagram. Optimise for *conversations started*. Instagram
  is where this brand's audience already is, so this is the first thing to try.
- **Click-to-WhatsApp ads (CTWA).** Same shape, pointed at the WhatsApp number.
  These work fine against the free Business app.

Ops detail worth knowing: a CTWA click opens a 24-hour customer-service window,
and **if you reply within 24 hours** a further 72-hour free-messaging window
opens.

What *not* to build yet, and why:

- **Advantage+ catalog ads / dynamic retargeting** — three SKUs give the
  algorithm nothing to choose between, and there is no on-site purchase event.
- **Web Custom Audiences** — need roughly 100 matched users to exist at all, and
  ~1,000 to perform. Current traffic is nowhere near that.
- **Conversions API for Business Messaging** — the real loop-closer, but it needs
  the WhatsApp Cloud API and a webhook server. Revisit only if conversation
  volume grows enough for the optimiser to learn from it. ⚠ Note it supports
  Instagram for *measurement only* — no ad purchase-optimisation on the channel
  this brand actually uses.

⚠ **VAT.** Egypt applies 14% VAT to advertising. A business with a Tax
Registration Number on file self-accounts under the reverse-charge mechanism and
Meta does not add VAT to the invoice; without a TRN, Meta adds the 14%. Confirm
which applies before budgeting.

---

## 5. Things that are closed, so nobody wastes a day on them

- Facebook / Instagram **Shop** — ⚠ Egypt unsupported, and checkout is gone.
- **Instagram product tagging** — ⚠ same.
- Instagram **"Shop" tab** — removed February 2023, never reinstated.
- **WhatsApp Pay** — India, Singapore, Brazil only.
- **On-premises WhatsApp API** — retired; the final client expired 23 Oct 2025.
- **Offline Conversions API** — retired 14 May 2025, folded into the unified
  Conversions API (`action_source: "chat"`).
- Carrying an `fbclid` from the website into a WhatsApp thread — not supported.
  Meta does not read `wa.me` message text. The only supported ad→chat click ID is
  `ctwa_clid`, which Meta injects itself on CTWA conversations.

---

## Not legal advice

`/privacy` was written to describe what this code actually does, honestly and in
both languages. It is not a lawyer's work. Before spending real money on ads —
which is when a data-protection complaint stops being hypothetical — have someone
qualified read it against Law 151 of 2020 and its executive regulations (Decree
816 of 2025). ⚠ The compliance grace period runs to roughly 1 November 2026.
