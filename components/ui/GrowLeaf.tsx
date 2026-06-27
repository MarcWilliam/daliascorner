/**
 * Decorative little sprout. Purely cosmetic → aria-hidden. Rendered static (no
 * entrance animation) so it's always present and can never disappear.
 */
export function GrowLeaf({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block ${className}`}>
      <svg
        width="40"
        height="46"
        viewBox="0 0 40 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 46 V22"
          stroke="rgb(var(--brand-deep))"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M20 30 C20 18 12 11 3 9 C5 22 11 28 20 31Z"
          fill="rgb(var(--leaf))"
        />
        <path
          d="M20 24 C20 12 28 5 37 3 C35 16 29 22 20 25Z"
          fill="rgb(var(--leaf-soft))"
          stroke="rgb(var(--leaf))"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}
