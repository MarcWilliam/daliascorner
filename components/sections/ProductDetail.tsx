"use client";

import { useEffect } from "react";
import { ArrowLeft, Leaf, Minus, Plus, Ruler, Truck } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { useConsent } from "@/components/providers/ConsentProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { MiniNav } from "@/components/sections/MiniNav";
import { Footer } from "@/components/sections/Footer";
import { CartDrawer } from "@/components/sections/CartDrawer";
import { ClayButton } from "@/components/ui/ClayButton";
import { POT_HEIGHT_CM, PRODUCTS, type Product } from "@/lib/products";
import { productPath } from "@/lib/config";
import { asset } from "@/lib/asset";
import { trackViewContent } from "@/lib/meta";

const accentTint: Record<Product["accent"], string> = {
  orange: "bg-orange/15",
  clay: "bg-clay-soft",
  leaf: "bg-leaf-soft",
  mauve: "bg-mauve-soft",
};

/**
 * A character's own page. It exists for two reasons that both come from outside
 * the site: the Meta catalog feed's `link` field must point at "the specific
 * product page for the item", and a paid ad has to land somewhere more specific
 * than a one-pager. Deliberately small — everything it shows already lives in
 * lib/products.ts, so there is no second copy of anything to keep in sync.
 */
export function ProductDetail({ product }: { product: Product }) {
  const { t, locale, messages } = useLocale();
  const { add, increment, decrement, lines, open } = useCart();
  const { consent } = useConsent();
  const announce = useAnnouncer();

  const name = product.name[locale];
  const qty = lines.find((l) => l.id === product.id)?.qty ?? 0;
  const others = PRODUCTS.filter((p) => p.id !== product.id);

  const onSale =
    product.price != null &&
    product.originalPrice != null &&
    product.originalPrice > product.price;

  // The page IS the product view — no scroll heuristics needed. Keyed on the
  // consent value, NOT bare mount: ConsentProvider is an ANCESTOR, so its mount
  // effect (which flips tracking on for a returning "granted" visitor) runs
  // AFTER this descendant's effect. Firing on mount would always hit the pre-
  // consent no-op and ViewContent would never send. Depending on `consent`
  // instead fires once it resolves to "granted" — whether restored from storage
  // or granted live on this page — by which point setTrackingEnabled(true) has
  // already run in the same ConsentProvider effect.
  useEffect(() => {
    if (consent === "granted") trackViewContent(product);
  }, [consent, product]);

  return (
    <>
      <MiniNav />

      <main id="main">
        <article className="section">
          <div className="container-page">
            <a
              href={asset("/#characters")}
              className="inline-flex items-center gap-2 rounded-clay py-2 font-display text-sm font-semibold text-ink-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
            >
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              {t("product.back")}
            </a>

            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
              {/* image */}
              <div
                className={`relative isolate overflow-hidden rounded-clay-lg border border-line p-4 shadow-photo ${accentTint[product.accent]}`}
              >
                <div className="aspect-square overflow-hidden rounded-clay bg-canvas">
                  <img
                    src={product.image}
                    alt={product.alt[locale]}
                    width={800}
                    height={800}
                    fetchPriority="high"
                    className="h-full w-full object-cover"
                  />
                </div>
                {onSale && (
                  <span className="absolute end-6 top-6 rounded-full bg-orange px-3 py-1.5 text-sm font-extrabold leading-none text-ink shadow-clay-sm">
                    -
                    {Math.round(
                      (1 - product.price! / product.originalPrice!) * 100,
                    )}
                    %
                  </span>
                )}
              </div>

              {/* body */}
              <div className="flex flex-col gap-5">
                <h1 className="text-3xl sm:text-4xl">{name}</h1>
                <p className="text-lg leading-relaxed text-ink-muted">
                  {product.blurb[locale]}
                </p>

                {product.price != null && (
                  <p className="flex items-baseline gap-3">
                    <span className="tabular font-display text-3xl font-bold text-brand">
                      {product.price} {messages.cart.currency}
                    </span>
                    {onSale && (
                      <span className="tabular text-lg text-ink-muted line-through">
                        {product.originalPrice} {messages.cart.currency}
                      </span>
                    )}
                  </p>
                )}

                {/* add to cart, or the quantity stepper once it's in the cart */}
                {qty === 0 ? (
                  <ClayButton
                    type="button"
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      add(product.id);
                      announce(t("cart.added", { name }));
                    }}
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                    {t("cart.add")}
                  </ClayButton>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      role="group"
                      aria-label={`${t("cart.quantity")} — ${name}`}
                      className="grid min-h-[3.5rem] grid-cols-[3.5rem_1fr_3.5rem] items-center overflow-hidden rounded-clay border-2 border-brand bg-surface"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          announce(
                            qty <= 1
                              ? t("cart.removed", { name })
                              : `${name} — ${t("cart.quantity")}: ${qty - 1}`,
                          );
                          decrement(product.id);
                        }}
                        aria-label={t("cart.decrease")}
                        className="grid h-full place-items-center text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
                      >
                        <Minus className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <span className="tabular select-none px-4 text-center font-display text-lg font-bold text-ink">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          increment(product.id);
                          announce(`${name} — ${t("cart.quantity")}: ${qty + 1}`);
                        }}
                        aria-label={t("cart.increase")}
                        className="grid h-full place-items-center text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                    <ClayButton
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={open}
                    >
                      {t("product.viewCart")}
                    </ClayButton>
                  </div>
                )}

                {/* the facts every customer asks about, from the FAQ + specs */}
                <ul className="mt-2 grid gap-3">
                  <li className="flex gap-3 rounded-clay border border-line bg-surface p-4">
                    <Ruler className="h-5 w-5 shrink-0 text-mauve" aria-hidden="true" />
                    <div>
                      <p className="font-display font-semibold text-ink">
                        {t("product.size")}
                      </p>
                      <p className="text-sm leading-relaxed text-ink-muted">
                        {t("product.sizeNote", { cm: POT_HEIGHT_CM })}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 rounded-clay border border-line bg-surface p-4">
                    <Leaf className="h-5 w-5 shrink-0 text-leaf" aria-hidden="true" />
                    <div>
                      <p className="font-display font-semibold text-ink">
                        {t("product.included")}
                      </p>
                      <p className="text-sm leading-relaxed text-ink-muted">
                        {t("product.includedNote")}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 rounded-clay border border-line bg-surface p-4">
                    <Truck className="h-5 w-5 shrink-0 text-clay" aria-hidden="true" />
                    <div>
                      <p className="font-display font-semibold text-ink">
                        {t("product.delivery")}
                      </p>
                      <p className="text-sm leading-relaxed text-ink-muted">
                        {t("product.deliveryNote")}
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            {/* the other characters */}
            <section className="mt-16">
              <h2 className="text-2xl sm:text-3xl">{t("product.others")}</h2>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2">
                {others.map((p) => (
                  <li key={p.id}>
                    <a
                      href={asset(productPath(p.id))}
                      className="group flex items-center gap-4 rounded-clay-lg border border-line bg-surface p-4 shadow-clay-sm transition-shadow hover:shadow-photo focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
                    >
                      <span
                        className={`shrink-0 rounded-clay p-2 ${accentTint[p.accent]}`}
                      >
                        <img
                          src={p.thumb}
                          alt=""
                          width={72}
                          height={72}
                          loading="lazy"
                          className="h-16 w-16 rounded-clay object-cover"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg font-semibold text-ink">
                          {p.name[locale]}
                        </span>
                        {p.price != null && (
                          <span className="tabular block text-sm font-bold text-brand">
                            {p.price} {messages.cart.currency}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </article>
      </main>

      <Footer />
      <CartDrawer />
    </>
  );
}
