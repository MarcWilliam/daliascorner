/**
 * Static export for GitHub Pages.
 *
 * `output: "export"` emits a fully static site into ./out (no Node server needed).
 * Production serves from the apex custom domain (daliascorner.com) at root, so the
 * CI build leaves NEXT_PUBLIC_BASE_PATH empty. Set it only for a non-root deploy
 * (e.g. a github.io/<repo> subpath preview) to prefix every asset/_next URL.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
