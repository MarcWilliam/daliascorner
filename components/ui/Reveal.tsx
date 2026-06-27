"use client";

import { useReducedMotion } from "framer-motion";
import { EASE_OUT, DUR, VIEWPORT } from "@/lib/motion";
import { useMounted, motionTag } from "./reveal-primitives";

/**
 * Scroll-in reveal (fade + gentle rise), composed on top of existing markup.
 * Accessibility-first:
 *  - Until mounted (SSR / no-JS / observer never fires) it renders plain & visible.
 *  - prefers-reduced-motion → no transform, content shown immediately.
 *  - whileInView fires once; transform/opacity only.
 * Same props API as before so call sites are unchanged.
 */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  as?: keyof JSX.IntrinsicElements;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();

  // No motion path: render the plain element, fully visible.
  if (reduce || !mounted) {
    const Tag = as as React.ElementType;
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = motionTag(as);
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={{
        hidden: { opacity: 0, y: 22 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: DUR.reveal, ease: EASE_OUT, delay: delayMs / 1000 },
        },
      }}
    >
      {children}
    </MotionTag>
  );
}
