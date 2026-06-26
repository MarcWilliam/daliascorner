"use client";

import { m, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import type { Product } from "@/lib/products";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { CARD_TILT } from "@/lib/motion";

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
  const { add, increment, decrement, lines } = useCart();
  const announce = useAnnouncer();
  const reduce = useReducedMotion();

  const name = product.name[locale];
  // How many of this character are currently in the cart.
  const qty = lines.find((l) => l.id === product.id)?.qty ?? 0;

  // 3D pointer tilt + lift. Raw motion values are set from pointer position and
  // eased through springs, so y / scale / rotateX / rotateY compose into one
  // smooth transform. Mouse-only; resets on leave; disabled for reduced motion.
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const lift = useMotionValue(0);
  const scale = useMotionValue(1);
  const sRotateX = useSpring(rotateX, CARD_TILT.spring);
  const sRotateY = useSpring(rotateY, CARD_TILT.spring);
  const sLift = useSpring(lift, CARD_TILT.spring);
  const sScale = useSpring(scale, CARD_TILT.spring);

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 (left) … 0.5 (right)
    const py = (e.clientY - r.top) / r.height - 0.5; // -0.5 (top)  … 0.5 (bottom)
    rotateY.set(px * 2 * CARD_TILT.maxDeg);
    rotateX.set(-py * 2 * CARD_TILT.maxDeg);
    // Engage the lift on move (fires immediately + continuously over the card),
    // which is more reliable than depending solely on pointerenter.
    lift.set(CARD_TILT.lift);
    scale.set(CARD_TILT.scale);
  }
  function handlePointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
    lift.set(0);
    scale.set(1);
  }

  function handleAdd() {
    add(product.id);
    announce(t("cart.added", { name }));
  }

  return (
    <m.article
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        reduce
          ? undefined
          : {
              rotateX: sRotateX,
              rotateY: sRotateY,
              y: sLift,
              scale: sScale,
              transformPerspective: CARD_TILT.perspective,
            }
      }
      className="group flex h-full flex-col overflow-hidden rounded-clay-lg border border-line bg-surface shadow-photo transition-shadow duration-300 [transform-style:preserve-3d] hover:shadow-photo-lg"
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

        {/* discount badge — shows the % saved when a product is on sale */}
        {product.price != null &&
          product.originalPrice != null &&
          product.originalPrice > product.price && (
            <span className="absolute end-3 top-3 rounded-full bg-orange px-2.5 py-1 text-xs font-extrabold leading-none text-ink shadow-clay-sm">
              -{Math.round((1 - product.price / product.originalPrice) * 100)}%
            </span>
          )}
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

        {/* price — discounted value with the original struck through */}
        {product.price != null && (
          <p className="flex items-baseline gap-2">
            <span className="tabular font-display text-lg font-bold text-brand">
              {product.price} {messages.cart.currency}
            </span>
            {product.originalPrice != null && product.originalPrice > product.price && (
              <span className="tabular text-sm text-ink-muted line-through">
                {product.originalPrice} {messages.cart.currency}
              </span>
            )}
          </p>
        )}

        {/* add to cart, or an inline quantity stepper once it's in the cart */}
        {qty === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="btn-clay mt-2 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-clay bg-brand px-5 font-display font-semibold leading-none text-canvas [--edge:var(--brand-edge)] [touch-action:manipulation] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {t("cart.add")}
          </button>
        ) : (
          <div
            role="group"
            aria-label={`${t("cart.quantity")} — ${name}`}
            className="mt-2 grid min-h-[3rem] grid-cols-[3rem_1fr_3rem] items-center overflow-hidden rounded-clay border-2 border-brand bg-surface"
          >
            <button
              type="button"
              onClick={() => decrement(product.id)}
              aria-label={t("cart.decrease")}
              className="grid h-full place-items-center text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <span
              className="tabular select-none text-center font-display text-lg font-bold text-ink"
              aria-live="polite"
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={() => increment(product.id)}
              aria-label={t("cart.increase")}
              className="grid h-full place-items-center text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </m.article>
  );
}
