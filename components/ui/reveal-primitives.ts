"use client";

import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { m } from "framer-motion";

/**
 * Shared building blocks for the scroll-reveal primitives (Reveal, RevealTitle,
 * RevealGroup/RevealItem) so the SSR-safe mount gate and the motion-tag lookup
 * live in one place instead of being re-inlined per component.
 */

/** false on the server / first client paint, true after mount — gates animation. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Resolve an intrinsic tag name (e.g. "div", "li") to its framer-motion element. */
export function motionTag(as: keyof JSX.IntrinsicElements): ElementType {
  return (m as unknown as Record<string, ElementType>)[as];
}
