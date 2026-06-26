import type { Variants } from "framer-motion";

/**
 * Shared motion language for Dalia's Corner — one rhythm everywhere.
 * Soft, organic, clay-warm: gentle ease-out, no overshoot, modest distances.
 * Animate transform/opacity only. Every consumer must gate on useReducedMotion().
 */

/** Gentle ease-out (no overshoot) — the house easing. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Reveal-on-scroll viewport: fire once, a touch before fully in view. */
export const VIEWPORT = { once: true, margin: "-10% 0px -10% 0px" } as const;

export const DUR = { reveal: 0.6, soft: 0.5, slow: 0.8 } as const;

/** Generic section/element reveal: fade + small rise. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_OUT } },
};

/** Card reveal: fade + rise + a slight scale settle. */
export const fadeRiseScale: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR.reveal, ease: EASE_OUT },
  },
};

/** Parent that staggers its children in sequence. */
export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

/** Hero on-load: container + line-by-line items. */
export const heroParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};
export const heroItem: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_OUT } },
};

/** Gentle, slow, infinite bob for the floating hero chips (transform only). */
export const chipBob = (offset: number) => ({
  y: [0, -8, 0],
  transition: {
    duration: 4.5,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay: offset,
  },
});

/** Subtle hover lift + tilt for character cards. */
export const cardHover = {
  y: -6,
  scale: 1.02,
  rotate: -0.6,
  transition: { type: "spring" as const, stiffness: 260, damping: 22 },
};
