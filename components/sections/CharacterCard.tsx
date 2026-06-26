"use client";

import { useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import type { Product } from "@/lib/products";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { cardHover } from "@/lib/motion";

const accentTint: Record<Product["accent"], string> = {
  orange: "bg-orange/15",
  clay: "bg-clay-soft",
  leaf: "bg-leaf-soft",
};
const accentDot: Record<Product["accent"], string> = {
  orange: "bg-orange",
  clay: "bg-clay",
  leaf: "bg-leaf",
};

export function CharacterCard({ product }: { product: Product }) {
  const { t, locale, messages } = useLocale();
  const { add } = useCart();
  const announce = useAnnouncer();
  const reduce = useReducedMotion();
  const [justAdded, setJustAdded] = useState(false);

  const name = product.name[locale];

  function handleAdd() {
    add(product.id);
    announce(t("cart.added", { name }));
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <m.article
      whileHover={reduce ? undefined : cardHover}
      className="group flex h-full flex-col overflow-hidden rounded-clay-lg border border-line bg-surface shadow-clay transition-shadow duration-200 hover:shadow-clay-lg"
    >
      {/* image tile */}
      <div className={`relative ${accentTint[product.accent]} p-4`}>
        <div className="aspect-square overflow-hidden rounded-clay bg-canvas">
          <img
            src={product.image}
            alt={product.alt[locale]}
            width={400}
            height={400}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        </div>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="flex items-center gap-2 text-xl">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${accentDot[product.accent]}`} />
          {name}
        </h3>
        <p className="flex-1 text-[0.975rem] leading-relaxed text-ink-muted">
          {product.blurb[locale]}
        </p>

        {/* optional price (only renders if a product has one) */}
        {product.price != null && (
          <p className="tabular font-display text-lg font-bold text-brand">
            {product.price} {messages.cart.currency}
          </p>
        )}

        <button
          type="button"
          onClick={handleAdd}
          className={`btn-clay mt-2 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-clay px-5 font-display font-semibold leading-none [touch-action:manipulation] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 ${
            justAdded
              ? "bg-leaf text-ink [--edge:#6f8a5d]"
              : "bg-brand text-canvas [--edge:var(--brand-edge)]"
          }`}
        >
          {justAdded ? (
            <>
              <Check className="h-5 w-5" aria-hidden="true" />
              {t("cart.added", { name })}
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" aria-hidden="true" />
              {t("cart.add")}
            </>
          )}
        </button>
      </div>
    </m.article>
  );
}
