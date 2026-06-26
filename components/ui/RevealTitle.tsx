"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { titleRise, VIEWPORT } from "@/lib/motion";

/**
 * Section-title reveal: the heading rises out of an overflow-hidden mask when
 * scrolled into view — the editorial "line lift" that anchors each section.
 * Transform-only (no clip-path, no reflow).
 *
 * Accessibility / progressive enhancement:
 *  - SSR / no-JS / before mount → renders plainly and fully visible.
 *  - prefers-reduced-motion → no mask, shown immediately.
 *
 * Wrap a single heading element (e.g. an <h2>). The small bottom padding gives
 * descenders room so nothing is clipped at rest.
 */
export function RevealTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (reduce || !mounted) {
    return <div className={className}>{children}</div>;
  }

  // The in-view trigger lives on the OUTER (unclipped) mask, then propagates to
  // the inner line — if it sat on the inner element, its own `overflow-hidden`
  // parent would clip it out of view and the observer would never fire.
  return (
    <m.div
      className={`overflow-hidden pb-[0.14em] ${className}`}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={MASK_PARENT}
    >
      <m.div variants={titleRise}>{children}</m.div>
    </m.div>
  );
}

/** Empty parent → just orchestrates; the inner line carries the actual motion. */
const MASK_PARENT = { hidden: {}, visible: {} };
