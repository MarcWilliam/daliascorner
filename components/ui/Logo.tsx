/**
 * Dalia's Corner brand logo — the real hand-drawn lockup
 * (wordmark + the little potted characters + "A Little Corner of Love" ribbon).
 * The artwork sits on a cream field that matches the site canvas, so it blends
 * seamlessly on light surfaces; round the corners when placed on a dark one.
 *
 * Swap the file at /public/logo.jpg to update it everywhere — markup won't change.
 */

import { asset } from "@/lib/asset";

const LOGO_SRC = asset("/logo.jpg");

export function Logo({
  className = "",
  alt = "Dalia's Corner — A Little Corner of Love",
}: {
  className?: string;
  /** Pass "" when a wrapping element already labels the logo (e.g. an aria-label link). */
  alt?: string;
}) {
  return (
    // Plain <img> on purpose — see lib/asset.ts: /public paths are basePath-prefixed by hand.
    <img
      src={LOGO_SRC}
      alt={alt}
      width={823}
      height={823}
      draggable={false}
      className={`block select-none ${className}`}
    />
  );
}
