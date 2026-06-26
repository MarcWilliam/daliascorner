/**
 * Renders copy where one word is wrapped in *asterisks* as an accent-coloured span.
 * Keeps the dictionaries plain-text (no HTML) while allowing a single highlighted word.
 * e.g. "Not just planters… they're *characters* with stories."
 */
export function RichText({
  text,
  accentClassName = "text-clay-deep",
  className,
}: {
  text: string;
  accentClassName?: string;
  className?: string;
}) {
  const parts = text.split("*");
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={accentClassName}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
