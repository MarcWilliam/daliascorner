/**
 * Dalia's Corner brand logo — the real hand-drawn lockup
 * (wordmark + the little potted characters + "A Little Corner of Love" ribbon).
 * Transparent PNG, so it drops cleanly onto the site canvas and any light
 * surface; sit it on a light tile when it's placed on a dark one (see the footer).
 *
 * Swap the file at /public/logo-trans.png to update it everywhere — markup won't change.
 */

import { asset } from "@/lib/asset";

const LOGO_SRC = asset("/logo-trans.png");

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
      width={1920}
      height={1920}
      draggable={false}
      className={`block select-none ${className}`}
    />
  );
}
