"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";

/**
 * Slim reading-progress bar pinned to the top of the viewport (above the nav).
 * - Spring-smoothed so it trails the scroll with a soft, warm feel.
 * - Grows from the reading edge (left in LTR, right in RTL).
 * - Purely decorative → aria-hidden; hidden entirely under reduced motion.
 */
export function ScrollProgress() {
  const reduce = useReducedMotion();
  const { dir } = useLocale();
  const [mounted, setMounted] = useState(false);
  // Reading edge follows the active direction — derived live, so it stays correct
  // when the visitor toggles locale (which flips <html dir> at runtime).
  const origin = dir === "rtl" ? "right" : "left";

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.4,
  });

  useEffect(() => setMounted(true), []);

  // No bar for reduced-motion users (and not until mounted, to avoid a flash).
  if (reduce || !mounted) return null;

  return (
    <m.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-gradient-to-r from-brand via-clay to-orange"
      style={{ scaleX, transformOrigin: origin }}
    />
  );
}
