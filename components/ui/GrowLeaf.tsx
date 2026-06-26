"use client";

import { m, useReducedMotion } from "framer-motion";
import { EASE_OUT, VIEWPORT } from "@/lib/motion";

/**
 * Decorative little sprout that "grows" from its base when scrolled into view
 * (scale up from 0 with a tiny settle). Purely cosmetic → aria-hidden.
 * Reduced motion → simply present, no grow.
 */
export function GrowLeaf({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.span
      aria-hidden="true"
      className={`inline-block ${className}`}
      style={{ transformOrigin: "bottom center" }}
      initial={reduce ? false : { scale: 0, rotate: -10, opacity: 0 }}
      whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <svg
        width="40"
        height="46"
        viewBox="0 0 40 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 46 V22"
          stroke="var(--brand-deep)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M20 30 C20 18 12 11 3 9 C5 22 11 28 20 31Z"
          fill="var(--leaf)"
        />
        <path
          d="M20 24 C20 12 28 5 37 3 C35 16 29 22 20 25Z"
          fill="var(--leaf-soft)"
          stroke="var(--leaf)"
          strokeWidth="1.5"
        />
      </svg>
    </m.span>
  );
}
