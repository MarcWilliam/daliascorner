"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { cascadeParent, fadeRiseScale, VIEWPORT } from "@/lib/motion";

type Tag = keyof JSX.IntrinsicElements;

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Orchestrated reveal container. A single in-view observer on the parent drives
 * all its <RevealItem> children, so a grid/list cascades in as one designed
 * sequence (90ms apart) instead of each item firing on its own timer.
 *
 * SSR / no-JS / reduced-motion → renders plainly and fully visible.
 * Children must be <RevealItem> (or any element carrying the same variant names).
 */
export function RevealGroup({
  children,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();

  if (reduce || !mounted) {
    const Plain = as as React.ElementType;
    return <Plain className={className}>{children}</Plain>;
  }

  const MotionTag = (m as unknown as Record<string, React.ElementType>)[as];
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={cascadeParent}
    >
      {children}
    </MotionTag>
  );
}

/**
 * A single item inside a <RevealGroup>. Fades + rises with a soft scale settle,
 * timed by the parent's cascade (no own observer). Renders plainly until mounted.
 */
export function RevealItem({
  children,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();

  if (reduce || !mounted) {
    const Plain = as as React.ElementType;
    return <Plain className={className}>{children}</Plain>;
  }

  const MotionTag = (m as unknown as Record<string, React.ElementType>)[as];
  return (
    <MotionTag className={className} variants={fadeRiseScale}>
      {children}
    </MotionTag>
  );
}
