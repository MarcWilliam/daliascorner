"use client";

import { useRef } from "react";
import { useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RichText } from "@/components/ui/RichText";
import { Reveal } from "@/components/ui/Reveal";
import { Blob } from "@/components/ui/Blob";
import { GrowLeaf } from "@/components/ui/GrowLeaf";

export function About() {
  const { t } = useLocale();
  const reduce = useReducedMotion();

  // Subtle scroll parallax for the two decorative blobs (transform only).
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const yLeaf = useTransform(scrollYProgress, [0, 1], [-22, 22]);
  const yClay = useTransform(scrollYProgress, [0, 1], [22, -22]);

  return (
    <section id="story" ref={ref} className="section relative scroll-mt-24">
      <div className="container-page">
        <Reveal className="relative mx-auto max-w-3xl overflow-hidden rounded-[2.5rem] border border-line bg-surface px-6 py-10 text-center shadow-clay sm:px-12 sm:py-14">
          <Blob
            className="end-[-3rem] top-[-3rem] h-44 w-44 text-leaf-soft"
            style={reduce ? undefined : { y: yLeaf }}
          />
          <Blob
            className="start-[-3rem] bottom-[-3rem] h-44 w-44 text-clay-soft"
            style={reduce ? undefined : { y: yClay }}
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
