"use client";

import { useScroll, useTransform, type MotionValue } from "framer-motion";
import type { RefObject } from "react";

/**
 * Scroll-linked vertical parallax for decorative layers (blobs, etc.).
 * Maps a section's travel through the viewport to a small ± translateY range and
 * returns two opposing motion values so paired blobs drift against each other,
 * which reads as depth. Transform-only; every caller must gate on reduced motion.
 *
 * @param ref       the section element whose scroll progress drives the motion
 * @param distance  peak offset in px for each layer (default 40)
 */
export function useParallaxPair(
  ref: RefObject<HTMLElement>,
  distance = 40,
): { down: MotionValue<number>; up: MotionValue<number> } {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const down = useTransform(scrollYProgress, [0, 1], [-distance, distance]);
  const up = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return { down, up };
}
