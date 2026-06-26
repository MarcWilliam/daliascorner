/**
 * Decorative leaf that sways slowly & forever (motion-safe) — a leafier
 * counterpart to <Blob> for section backdrops. Purely cosmetic → aria-hidden.
 *
 * Pivots from its stem (transform-origin bottom center) so it swings like a leaf
 * in a breeze — rotation-led, distinct from the blobs' positional drift. Size and
 * position come from `className`. It sits behind content (-z-10), so the parent
 * needs its own stacking context (e.g. `isolate`) to keep it visible.
 */
export function FloatingLeaf({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ transformOrigin: "bottom center" }}
      className={`pointer-events-none absolute -z-10 block motion-safe:animate-leaf-sway ${className}`}
    >
      <svg
        viewBox="0 0 44 62"
        fill="none"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* stem */}
        <path
          d="M22 46 C22 52 22 56 22 60"
          stroke="var(--brand-deep)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* blade */}
        <path
          d="M22 2 C37 13 39 31 22 47 C5 31 7 13 22 2 Z"
          fill="var(--leaf-soft)"
          stroke="var(--leaf)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* midrib */}
        <path
          d="M22 9 C21 22 22 35 22 44"
          stroke="var(--leaf)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* side veins */}
        <path
          d="M22 19 L13 14 M22 19 L31 14 M22 29 L14 25 M22 29 L30 25"
          stroke="var(--leaf)"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}
