/**
 * Styled wordmark stand-in for the real Dalia's Corner logo.
 * SLOT: when the real logo file arrives, drop it in /public and render it
 * inside <LogoTile> / replace <Wordmark> — markup elsewhere won't change.
 */

/** Tiny fox + leaf glyph, brand-coloured, used inside the squircle tile. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* leaf */}
      <path
        d="M24 6c7 2 11 7 11 13 0 2-.4 3.7-1.1 5.2C31 22.8 27 21 24 21s-7 1.8-9.9 3.2C13.4 22.7 13 21 13 19c0-6 4-11 11-13z"
        fill="var(--leaf)"
      />
      <path
        d="M24 6v15"
        stroke="var(--brand-deep)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* fox face */}
      <path
        d="M24 24c4 0 7 2 8.4 5l1.8 4.2-3.2-1-1.4 3.8L24 34l-5.6 2-1.4-3.8-3.2 1 1.8-4.2C17 26 20 24 24 24z"
        fill="var(--clay)"
      />
      <path d="M24 27l-3.2 2.2L24 31l3.2-1.8L24 27z" fill="var(--canvas)" />
      <circle cx="21" cy="29.4" r="1" fill="var(--ink)" />
      <circle cx="27" cy="29.4" r="1" fill="var(--ink)" />
    </svg>
  );
}

export function LogoTile({ className = "" }: { className?: string }) {
  return (
    <span
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-[1.1rem] bg-canvas-sunk shadow-clay-sm ${className}`}
    >
      <LogoMark className="h-7 w-7" />
    </span>
  );
}

export function Wordmark({
  className = "",
  withTagline = false,
}: {
  className?: string;
  withTagline?: boolean;
}) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      {/* Brand name stays Latin in both locales (it's the logo). */}
      <span
        dir="ltr"
        className="font-display text-xl font-extrabold tracking-tight text-brand"
      >
        Dalia&apos;s Corner
      </span>
      {withTagline && (
        <span dir="ltr" className="font-body text-[0.7rem] font-medium text-ink-muted">
          A Little Corner of Love
        </span>
      )}
    </span>
  );
}
