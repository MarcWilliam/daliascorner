/**
 * Prefix a /public asset path with the deploy basePath.
 *
 * Production serves from the custom apex domain at root, so NEXT_PUBLIC_BASE_PATH
 * is empty and this is a no-op. It still earns its keep for any non-root deploy
 * (e.g. a github.io/<repo> subpath preview): Next.js only auto-prefixes next/link,
 * next/image, and next/script, so plain <img src="/..."> strings and metadata URLs
 * would otherwise 404 under a basePath. Set NEXT_PUBLIC_BASE_PATH for those.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Resolve a root-relative /public path against the active deploy basePath. */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
