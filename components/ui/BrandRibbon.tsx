"use client";

import { useReducedMotion } from "framer-motion";
import { Sprout } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

/**
 * A warm brand ribbon between sections — a slow, continuous band of the same
 * honest trust phrases used in the hero, punctuated by little sprouts.
 *
 * - Constant-velocity (linear) marquee via a CSS keyframe, so it keeps drifting
 *   without re-rendering; pauses on hover so it never fights a reader.
 * - Reduced motion → a calm, centered, static row (no movement at all).
 * - Decorative copy is mirrored for the seamless loop, so the duplicate is
 *   aria-hidden to avoid screen-reader repetition.
 */
export function BrandRibbon() {
  const { messages } = useLocale();
  const reduce = useReducedMotion();
  const items = messages.hero.trust;

  const Phrase = ({ label }: { label: string }) => (
    <span className="flex shrink-0 items-center gap-4">
      <span className="font-display text-base font-semibold tracking-wide sm:text-lg">
        {label}
      </span>
      <Sprout className="h-4 w-4 shrink-0 text-leaf-soft" aria-hidden="true" />
    </span>
  );

  // One pass of the phrases; duplicated to make the loop seamless. A tight gap
  // keeps the strip continuously populated even on a narrow phone viewport.
  const Track = () => (
    <div className="flex shrink-0 items-center gap-4 pe-4">
      {items.map((label, i) => (
        <Phrase key={i} label={label} />
      ))}
    </div>
  );

  return (
    // Decorative band — these trust phrases already read in the hero, so the whole
    // ribbon is hidden from assistive tech to avoid repetition.
    <section
      aria-hidden="true"
      // Force LTR placement so the overflowing strip anchors at the left edge and
      // the leftward loop always covers the viewport (in an RTL page it would
      // otherwise anchor right, spill left, and slide fully off-screen). Arabic
      // glyphs inside each phrase still shape right-to-left on their own.
      dir="ltr"
      className="relative overflow-hidden border-y border-brand-edge/50 bg-brand py-3.5 text-canvas"
    >
      {/* soft fade at both edges so phrases drift in/out rather than hard-cut */}
      <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-12 bg-gradient-to-r from-brand to-transparent sm:w-20" />
      <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-12 bg-gradient-to-l from-brand to-transparent sm:w-20" />

      {reduce ? (
        <div className="container-page flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
          {items.map((label, i) => (
            <Phrase key={i} label={label} />
          ))}
        </div>
      ) : (
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
          <Track />
          <Track />
        </div>
      )}
    </section>
  );
}
