"use client";

import { Hand, Heart, Sparkles, Sprout } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RichText } from "@/components/ui/RichText";
import { RevealTitle } from "@/components/ui/RevealTitle";
import { RevealGroup, RevealItem } from "@/components/ui/RevealGroup";
import { FloatingLeaf } from "@/components/ui/FloatingLeaf";

const ICONS: LucideIcon[] = [Hand, Sparkles, Sprout, Heart];
const TINTS = ["bg-clay-soft", "bg-mauve-soft", "bg-leaf-soft", "bg-orange/15"];

export function WhyUs() {
  const { t, messages } = useLocale();
  const points = messages.why.points;

  return (
    <section
      id="why"
      className="section relative isolate scroll-mt-24 overflow-hidden"
    >
      <FloatingLeaf className="end-[6%] top-6 h-20 w-14" />
      <FloatingLeaf className="start-[7%] bottom-8 h-16 w-11 motion-safe:[animation-delay:-3s]" />

      <div className="container-page">
        <RevealTitle className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">
            <RichText text={t("why.title")} accentClassName="text-clay-deep" />
          </h2>
        </RevealTitle>

        <RevealGroup as="ul" className="grid gap-5 sm:grid-cols-2">
          {points.map((point, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <RevealItem as="li" key={i}>
                <div className="flex h-full items-start gap-4 rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-clay ${TINTS[i % TINTS.length]}`}
                  >
                    <Icon className="h-6 w-6 text-ink" aria-hidden="true" />
                  </span>
                  <p className="pt-1.5 text-[1.05rem] font-medium leading-relaxed text-ink">
                    {point}
                  </p>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
