import { buildCatalogCsv } from "@/lib/catalog";

/**
 * Static route handler — `output: "export"` renders this once at build time and
 * writes the result into ./out, so GitHub Pages serves it like any other file.
 * There is no server; this never runs at request time.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildCatalogCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
