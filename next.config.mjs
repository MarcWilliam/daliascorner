/**
 * Static export for GitHub Pages.
 *
 * `output: "export"` emits a fully static site into ./out (no Node server needed).
 * basePath is driven by NEXT_PUBLIC_BASE_PATH so local dev/build stay at root while
 * the CI deploy sets it to "/daliascorner" (the project-repo subpath on GitHub Pages).
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
