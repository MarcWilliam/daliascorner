"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RichText } from "@/components/ui/RichText";
import { RevealTitle } from "@/components/ui/RevealTitle";
import { RevealGroup, RevealItem } from "@/components/ui/RevealGroup";
import { Blob } from "@/components/ui/Blob";
import { useParallaxPair } from "@/lib/parallax";
import { EASE_OUT } from "@/lib/motion";

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-clay-lg border border-line bg-surface shadow-clay-sm">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-display text-lg font-semibold text-ink transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
        >
          <span>{q}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-brand transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="panel"
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-btn`}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 text-[1.02rem] leading-relaxed text-ink-muted">
              {a}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Faq() {
  const { t, messages } = useLocale();
  const items = messages.faq.items;
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduce = useReducedMotion();

  const ref = useRef<HTMLElement | null>(null);
  const { down, up } = useParallaxPair(ref, 40);

  return (
    <section
      id="faq"
      ref={ref}
      className="section relative scroll-mt-24 overflow-hidden bg-canvas-sunk"
    >
      <Blob
        className="start-[-4rem] top-[3rem] h-48 w-48 text-mauve-soft opacity-70"
        style={reduce ? undefined : { y: down }}
      />
      <Blob
        className="end-[-4rem] bottom-[2rem] h-56 w-56 text-leaf-soft opacity-60"
        style={reduce ? undefined : { y: up }}
      />

      <div className="container-page">
        <RevealTitle className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">
            <RichText text={t("faq.title")} accentClassName="text-clay-deep" />
          </h2>
        </RevealTitle>

        <RevealGroup className="mx-auto flex max-w-3xl flex-col gap-3">
          {items.map((item, i) => (
            <RevealItem key={i}>
              <FaqItem
                q={item.q}
                a={item.a}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
