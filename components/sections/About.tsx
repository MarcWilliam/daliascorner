"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { RichText } from "@/components/ui/RichText";
import { Reveal } from "@/components/ui/Reveal";
import { Blob } from "@/components/ui/Blob";
import { GrowLeaf } from "@/components/ui/GrowLeaf";

export function About() {
  const { t } = useLocale();

  return (
    <section
      id="story"
      className="section relative scroll-mt-24 bg-canvas-sunk"
    >
      <div className="container-page">
        {/*
          `isolate` is load-bearing: it makes the card its own stacking context so
          the -z-10 blobs stay painted above the card's opaque background. Without
          it the blobs only showed while the reveal's transform happened to create a
          stacking context, then vanished the moment it settled.
        */}
        <Reveal className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-[2.5rem] border border-line bg-surface px-6 py-10 text-center shadow-clay sm:px-12 sm:py-14">
          {/* Both blobs drift slowly & forever (motion-safe); the negative delay
              offsets the clay one half a cycle so they move against each other. */}
          <Blob drift className="end-[-3rem] top-[-3rem] h-44 w-44 text-leaf-soft" />
          <Blob
            drift
            className="start-[-3rem] bottom-[-3rem] h-44 w-44 text-clay-soft motion-safe:[animation-delay:-4500ms]"
          />
          <GrowLeaf className="relative mx-auto mb-3 block w-10" />
          <h2 className="relative text-3xl sm:text-4xl">
            <RichText text={t("about.title")} accentClassName="text-clay-deep" />
          </h2>
          <p className="relative mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
            {t("about.body")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
