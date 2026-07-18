"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ArrowRight, Tag, Truck, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useConsent } from "@/components/providers/ConsentProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { STORAGE_PROMO_DISMISSED } from "@/lib/config";
import { EASE_OUT, SPRING_SOFT, sealFloat } from "@/lib/motion";

/**
 * Floating promo seal — a clay "sale sticker" that bobs in the bottom inline-start
 * corner (mirrors in RTL, clears BackToTop on the inline-end). Collapsed it's a
 * compact 20%-off seal; tapped, it opens a small popover that presents BOTH live
 * offers (the 20% sale and free delivery) so a phone screen never carries two
 * competing bobbing badges. Non-modal: it never traps focus or blocks the page.
 *
 * It shows on the home page only (its CTA scrolls to #characters) and:
 *  • auto-expires after the sale ends, so a stale banner never lingers;
 *  • yields to the consent banner (same bottom band) until that's resolved — the
 *    promo is marketing, the banner is a legal ask, so the banner wins the corner;
 *  • can be hidden for the session; and honours prefers-reduced-motion throughout.
 */

// Sale ends 15 August 2026, end of day Cairo (UTC+3 in summer). After this the whole
// seal stops rendering — edit this one date (or lift the gate) to re-run a promo.
const SALE_ENDS = new Date("2026-08-16T00:00:00+03:00").getTime();

export function PromoStamp() {
  const { t, dir } = useLocale();
  const { bannerOpen } = useConsent();
  const reduce = useReducedMotion();

  // Gate on mount so the date check + sessionStorage read never mismatch the SSR
  // markup (the static export pre-renders with the seal absent).
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sealRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem(STORAGE_PROMO_DISMISSED) === "1") setDismissed(true);
    } catch {
      /* private mode — the seal just stays visible */
    }
  }, []);

  // Collapse back to the seal and return focus to it (keyboard-friendly).
  const collapse = useCallback(() => {
    setOpen(false);
    sealRef.current?.focus();
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_PROMO_DISMISSED, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // While open: Escape collapses, and a pointer/tap outside collapses — standard
  // popover dismissal. Move focus into the card so keyboard users land on Close.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        collapse();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, collapse]);

  // Nothing to show: before mount, after the sale ends, once dismissed, or while
  // the consent banner owns the bottom band.
  if (!mounted || Date.now() > SALE_ENDS || dismissed || bannerOpen) return null;

  const baseTilt = dir === "rtl" ? 7 : -7; // lean the seal toward the screen centre

  const offers = [
    { Icon: Tag, title: t("promo.saleTitle"), note: t("promo.saleNote") },
    { Icon: Truck, title: t("promo.deliveryTitle"), note: t("promo.deliveryNote") },
  ];

  return (
    <div
      ref={containerRef}
      // z-[92]: above BackToTop (z-[90], opposite corner), below the cart drawer
      // (z-[100]). Bottom inset clears the iOS home indicator like BackToTop does.
      className="fixed start-4 z-[92]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.1rem)" }}
    >
      <AnimatePresence>
        {open && (
          <m.div
            key="promo-card"
            id="promo-card"
            role="dialog"
            aria-label={t("promo.eyebrow")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 10 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.16, ease: EASE_OUT } }
            }
            transition={{ duration: 0.24, ease: EASE_OUT }}
            style={{ transformOrigin: dir === "rtl" ? "bottom right" : "bottom left" }}
            className="absolute bottom-full mb-3 start-0 w-[min(19rem,calc(100vw-2rem))] rounded-clay-lg border border-line bg-surface p-4 shadow-clay-lg"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={collapse}
              aria-label={t("promo.close")}
              className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <p className="pe-8 font-display text-sm font-bold uppercase tracking-wide text-clay-deep">
              {t("promo.eyebrow")}
            </p>

            <ul className="mt-3 flex flex-col gap-3">
              {offers.map(({ Icon, title, note }) => (
                <li key={title} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-blob bg-canvas-sunk text-clay-deep"
                  >
                    <Icon className="h-[1.35rem] w-[1.35rem]" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="font-display text-base font-bold text-ink">{title}</span>
                    <span className="text-sm text-ink-muted">{note}</span>
                  </span>
                </li>
              ))}
            </ul>

            <ClayButton
              href="#characters"
              variant="primary"
              onClick={collapse}
              className="mt-4 w-full"
            >
              {t("promo.cta")}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
            </ClayButton>

            <button
              type="button"
              onClick={dismiss}
              className="mx-auto mt-2 block rounded-clay px-3 py-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation]"
            >
              {t("promo.hide")}
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <m.button
        ref={sealRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("promo.aria")}
        aria-expanded={open}
        aria-controls="promo-card"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0.2 } : { ...SPRING_SOFT, delay: 0.9 }}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        className="block h-[4.75rem] w-[4.75rem] rounded-full [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/50 xs:h-20 xs:w-20"
      >
        {/* Inner wrapper carries the perpetual float so it composes cleanly with
            the button's entrance/tap transforms. Reduced motion → a static tilt. */}
        <m.span
          className="relative block h-full w-full"
          style={reduce ? { rotate: baseTilt } : undefined}
          animate={reduce ? undefined : sealFloat(baseTilt)}
        >
          {/* Clay disc + dashed "stamp" ring */}
          <span className="absolute inset-0 rounded-full border border-orange-edge/40 bg-orange shadow-clay" />
          <span className="absolute inset-[6px] rounded-full border-[1.5px] border-dashed border-ink/25" />
          {/* Stacked seal copy — dark ink only (white fails AA on orange) */}
          <span className="absolute inset-0 grid place-items-center text-center leading-none text-ink">
            <span className="flex flex-col items-center gap-0.5">
              <span className="font-display text-[0.6rem] font-bold uppercase tracking-wide">
                {t("promo.sealTop")}
              </span>
              <span className="font-display text-xl font-extrabold xs:text-2xl">
                {t("promo.sealValue")}
              </span>
              <span className="font-display text-[0.6rem] font-bold uppercase tracking-wide">
                {t("promo.sealBottom")}
              </span>
            </span>
          </span>
        </m.span>
      </m.button>
    </div>
  );
}
