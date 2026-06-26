"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { SPRING_SOFT } from "@/lib/motion";

/**
 * Floating clay pill that springs in once the page is scrolled, and returns the
 * reader to the top. Sits on the inline-end edge so it mirrors in RTL, clears the
 * iOS home indicator via the safe-area inset, and exits faster than it enters.
 * Reduced motion → simple fade + instant scroll.
 */
export function BackToTop() {
  const { locale } = useLocale();
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const label = locale === "ar" ? "العودة لأعلى" : "Back to top";

  function toTop() {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <AnimatePresence>
      {show && (
        <m.button
          type="button"
          onClick={toTop}
          aria-label={label}
          title={label}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: 10, scale: 0.85, transition: { duration: 0.18 } }
          }
          transition={reduce ? { duration: 0.15 } : SPRING_SOFT}
          whileHover={reduce ? undefined : { y: -3 }}
          whileTap={reduce ? undefined : { scale: 0.92 }}
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          className="fixed end-5 z-[90] grid h-12 w-12 place-items-center rounded-clay border border-line bg-surface text-brand shadow-clay [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </m.button>
      )}
    </AnimatePresence>
  );
}
