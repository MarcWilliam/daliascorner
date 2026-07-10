/**
 * Render schema.org blocks as <script type="application/ld+json">.
 *
 * Server component on purpose: the JSON has to land in the static HTML, where
 * crawlers and AI answer-engines read it without executing JS.
 */
export function JsonLd({ blocks }: { blocks: object[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
