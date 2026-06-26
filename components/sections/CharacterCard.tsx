"use client";

import { useEffect, useRef } from "react";
import { m, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import type { Product } from "@/lib/products";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { useDeviceTilt } from "@/components/providers/DeviceTiltProvider";
import { CARD_GYRO, CARD_TILT } from "@/lib/motion";

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
  const tilt = useDeviceTilt();
  const gyroActive = tilt.status === "active";

  const name = product.name[locale];
  // How many of this character are currently in the cart.
  const qty = lines.find((l) => l.id === product.id)?.qty ?? 0;

  // 3D tilt + lift. Raw motion values are set from one of three inputs and eased
  // through springs, so y / scale / rotateX / rotateY compose into one smooth
  // transform: a mouse over the card (desktop), a finger dragging across it
  // (touch), or the phone's gyroscope leaning the whole grid (mobile, ambient).
  // All gated on reduced motion. While a finger is down, touch wins over gyro.
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const lift = useMotionValue(0);
  const scale = useMotionValue(1);
  const sRotateX = useSpring(rotateX, CARD_TILT.spring);
  const sRotateY = useSpring(rotateY, CARD_TILT.spring);
  const sLift = useSpring(lift, CARD_TILT.spring);
  const sScale = useSpring(scale, CARD_TILT.spring);
  // True between pointerdown and pointerup/cancel for a touch on this card.
  const touching = useRef(false);

  // Ambient gyroscope lean: subscribe to the shared device tilt and write it
  // into this card's raw values — unless a finger is currently driving the card.
  useEffect(() => {
    if (!gyroActive || reduce) return;
    const apply = () => {
      if (touching.current) return;
      rotateY.set(tilt.tiltX.get() * CARD_GYRO.maxDeg);
      rotateX.set(tilt.tiltY.get() * CARD_GYRO.maxDeg);
    };
    const ux = tilt.tiltX.on("change", apply);
    const uy = tilt.tiltY.on("change", apply);
    return () => {
      ux();
      uy();
    };
  }, [gyroActive, reduce, tilt.tiltX, tilt.tiltY, rotateX, rotateY]);

  // Pointer drives the tilt toward the cursor (mouse) or finger (touch). The
  // card's `touch-action: pan-y` lets vertical swipes scroll the page (the
  // browser then fires pointercancel, handled below), while horizontal drags
  // tilt the card.
  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (reduce) return;
    if (e.pointerType === "touch") touching.current = true;
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
  // Return the card to rest, or — if the gyroscope is live — hand control back
  // to it by snapping to the current device lean so there's no visible jump.
  function rest() {
    if (gyroActive && !reduce) {
      rotateY.set(tilt.tiltX.get() * CARD_GYRO.maxDeg);
      rotateX.set(tilt.tiltY.get() * CARD_GYRO.maxDeg);
    } else {
      rotateX.set(0);
      rotateY.set(0);
    }
    lift.set(0);
    scale.set(1);
  }
  function handlePointerLeave() {
    // Mouse left the card; a touch never fires this, so it's safe to rest.
    rest();
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLElement>) {
    if (e.pointerType !== "touch") return;
    touching.current = false;
    rest();
  }

  function handleAdd() {
    add(product.id);
    announce(t("cart.added", { name }));
  }

  return (
    <m.article
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
      className="group flex h-full flex-col overflow-hidden rounded-clay-lg border border-line bg-surface shadow-photo transition-shadow duration-300 [touch-action:pan-y] [transform-style:preserve-3d] hover:shadow-photo-lg"
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
