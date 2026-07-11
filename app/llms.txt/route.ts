import { buildLlmsTxt } from "@/lib/llms";

/**
 * Static route handler — `output: "export"` renders this once at build time and
 * writes ./out/llms.txt, so GitHub Pages serves it like any other file. There is
 * no server; this never runs at request time. Replaces the old hand-written
 * public/llms.txt, which had to be kept in sync with the catalog by hand.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
