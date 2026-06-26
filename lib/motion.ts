import type { Variants } from "framer-motion";

/**
 * Shared motion language for Dalia's Corner — one rhythm everywhere.
 * Soft, organic, clay-warm: gentle ease-out, no overshoot, modest distances.
 * Animate transform/opacity only. Every consumer must gate on useReducedMotion().
 */

/** Gentle ease-out (no overshoot) — the house easing. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Soft spring for floating controls (back-to-top, scroll progress trail). */
export const SPRING_SOFT = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

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

/**
 * Orchestrated grid/list cascade — one observer on the parent drives the children,
 * so items reveal in a designed sequence rather than each on its own timer.
 * A touch quicker (90ms) than the generic parent for a premium, snappy feel.
 */
export const cascadeParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

/**
 * Section-title reveal: the heading rises out of an overflow-hidden mask.
 * Transform-only (no clip-path, no reflow). Pair with a wrapper that has
 * `overflow-hidden` so the pre-entrance copy is clipped below the baseline.
 */
export const titleRise: Variants = {
  hidden: { y: "115%" },
  visible: { y: "0%", transition: { duration: DUR.slow, ease: EASE_OUT } },
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

/**
 * Character-card hover: a clean lift + scale, plus a subtle 3D tilt toward the
 * cursor. Driven by motion values in CharacterCard (not a `whileHover` target),
 * so every transform part — y, scale, rotateX/rotateY — composes into one
 * smooth, springy matrix. Mouse-only; gated on reduced motion at the call site.
 */
export const CARD_TILT = {
  spring: { stiffness: 240, damping: 20, mass: 0.6 } as const,
  maxDeg: 7, // peak tilt, in degrees, toward the pointer
  lift: -10, // px the card floats on hover
  scale: 1.03,
  perspective: 850, // smaller = more dramatic depth
} as const;

/**
 * Mobile companion to CARD_TILT. On phones the same cards lean from two inputs:
 *  • gyroscope — the whole grid tilts ambiently toward the way the device is
 *    physically held (auto on Android; tap-to-enable on iOS, which gates the
 *    sensor behind a permission prompt). Kept gentler than the mouse tilt — a
 *    smaller peak with a deadzone — so it reads as calm ambience, not jitter.
 *  • touch — drag across a card and it tilts toward your finger, reusing the
 *    pointer math from CARD_TILT (lift + scale included) for desktop parity.
 * Both are reduced-motion gated at the call site, exactly like the mouse tilt.
 */
export const CARD_GYRO = {
  maxDeg: 5, // peak tilt from device orientation (below the mouse's 7° on purpose)
  range: 20, // degrees of physical device tilt that map to the full peak
  deadzone: 1.5, // degrees of slack around neutral — swallow resting-hand jitter
} as const;
