"use client";

import { m, type MotionStyle } from "framer-motion";

/**
 * Decorative organic blob (echoes "no two alike"). Purely cosmetic → aria-hidden.
 * Colour comes from a token class, e.g. text-leaf-soft / text-mauve-soft.
 * Accepts an optional motion `style` (e.g. a scroll-linked `y`) for subtle parallax.
 */
export function Blob({
  className = "",
  drift = false,
  style,
}: {
  className?: string;
  drift?: boolean;
  style?: MotionStyle;
}) {
  return (
    <m.span
      aria-hidden="true"
      style={style}
      className={`pointer-events-none absolute -z-10 block ${
        drift ? "motion-safe:animate-blob-drift" : ""
      } ${className}`}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <path
          fill="currentColor"
          d="M48.3,-58.6C61.5,-48.2,70.5,-32.7,72.9,-16.5C75.3,-0.3,71,16.6,62.3,30.8C53.6,45,40.5,56.5,25,63.6C9.5,70.7,-8.4,73.4,-25.2,68.8C-42,64.2,-57.7,52.3,-66.4,36.6C-75.1,20.9,-76.8,1.4,-71.8,-15.6C-66.8,-32.6,-55.1,-47.1,-41,-57C-26.9,-66.9,-10.4,-72.2,3.9,-77C18.2,-81.8,35.1,-69,48.3,-58.6Z"
          transform="translate(100 100)"
        />
      </svg>
    </m.span>
  );
}
