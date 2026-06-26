"use client";

import { useRef } from "react";
import {
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { RichText } from "@/components/ui/RichText";
import { Blob } from "@/components/ui/Blob";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { HERO_IMAGE, HERO_ALT, getProduct } from "@/lib/products";
import { WHATSAPP_NUMBER } from "@/lib/config";
import { EASE_OUT, DUR, heroParent, heroItem, chipBob } from "@/lib/motion";

/** The chip card visual (no positioning) — wrapped by MotionChip for motion. */
function ChipCard({ id }: { id: "bahira" | "shokat" }) {
  const { locale } = useLocale();
  const product = getProduct(id)!;
  return (
    <div className="flex items-center gap-2.5 rounded-clay border border-line bg-surface/95 p-2 pe-4 shadow-clay backdrop-blur-sm">
      <img
        src={product.image}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 rounded-[0.9rem] object-cover"
      />
      <div className="flex flex-col leading-tight">
        <span className="font-display text-sm font-bold text-ink">
          {product.name[locale]}
        </span>
        <span className="text-xs text-ink-muted">
          {locale === "ar" ? "شخصية يدوية" : "Handmade character"}
        </span>
      </div>
    </div>
  );
}

/** Positioned chip: soft entrance, then a gentle continuous bob (offset per chip). */
function MotionChip({
  id,
  positionClass,
  bobOffset,
  entranceDelay,
}: {
  id: "bahira" | "shokat";
  positionClass: string;
  bobOffset: number;
  entranceDelay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={`absolute z-10 ${positionClass}`}
      initial={reduce ? false : { opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: entranceDelay, duration: DUR.soft, ease: EASE_OUT }}
    >
      <m.div animate={reduce ? undefined : chipBob(bobOffset)}>
        <ChipCard id={id} />
      </m.div>
    </m.div>
  );
}

export function Hero() {
  const { t, messages, locale } = useLocale();
  const trust = messages.hero.trust;
  const reduce = useReducedMotion();

  // Low-intensity scroll parallax for the decorative blobs (transform only).
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const yLeaf = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const yMauve = useTransform(scrollYProgress, [0, 1], [0, -50]);

  const start = reduce ? false : "hidden";

  return (
    <section id="top" ref={heroRef} className="relative overflow-hidden">
      {/* organic background pops with subtle scroll parallax */}
      <Blob
        className="end-[-6rem] top-[-4rem] h-72 w-72 text-leaf-soft"
        style={reduce ? undefined : { y: yLeaf }}
      />
      <Blob
        className="start-[-7rem] bottom-[2rem] h-80 w-80 text-mauve-soft"
        style={reduce ? undefined : { y: yMauve }}
      />

      <div className="container-page grid items-center gap-10 pb-12 pt-10 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:pb-20 lg:pt-16">
        {/* Leading column — staggered on-load entrance */}
        <m.div
          className="flex flex-col items-start gap-5"
          variants={heroParent}
          initial={start}
          animate="visible"
        >
          <m.span
            variants={heroItem}
            className="inline-flex items-center gap-2 rounded-clay border border-line bg-surface px-4 py-2 font-display text-sm font-semibold text-clay-deep shadow-clay-sm"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("hero.badge")}
          </m.span>

          <m.h1 variants={heroItem} className="flex flex-col leading-none">
            <span className="font-display text-5xl font-extrabold tracking-tight text-brand sm:text-6xl">
              Dalia&apos;s Corner
            </span>
            <span className="mt-1 font-body text-base font-medium text-ink-muted">
              {t("hero.wordmarkSub")}
            </span>
          </m.h1>

          <m.p
            variants={heroItem}
            className="max-w-prose text-balance text-xl font-semibold text-ink sm:text-2xl"
          >
            <RichText text={t("hero.subheadline")} />
          </m.p>
          <m.p variants={heroItem} className="max-w-prose text-lg text-ink-muted">
            {t("hero.supporting")}
          </m.p>

          {/* CTAs */}
          <m.div variants={heroItem} className="mt-1 flex flex-wrap items-center gap-3">
            <ClayButton href="#characters" variant="primary" size="lg">
              {t("hero.ctaShop")}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
            </ClayButton>
            <ClayButton
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="lg"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {t("hero.ctaWhatsapp")}
            </ClayButton>
          </m.div>

          {/* Honest trust row (qualitative — no invented stats), staggered */}
          <m.ul
            variants={{
              hidden: { opacity: 0, y: 22 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: DUR.reveal, ease: EASE_OUT, staggerChildren: 0.08 },
              },
            }}
            className="mt-3 flex flex-wrap gap-x-5 gap-y-2"
          >
            {trust.map((label) => (
              <m.li
                key={label}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-leaf" />
                {label}
              </m.li>
            ))}
          </m.ul>
        </m.div>

        {/* Trailing column: hero photo (LCP-safe soft entrance) + floating chips */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <m.div
            className="relative aspect-square overflow-hidden rounded-[2.5rem] border border-line bg-canvas-sunk shadow-clay-lg"
            initial={reduce ? false : { opacity: 0.6, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.slow, ease: EASE_OUT }}
          >
            {/* PLACEHOLDER hero image — swap HERO_IMAGE in lib/products.ts */}
            <img
              src={HERO_IMAGE}
              alt={HERO_ALT[locale]}
              width={640}
              height={640}
              className="h-full w-full object-cover"
            />
          </m.div>
          {/* chips overlap on inline-start / inline-end so they mirror in RTL */}
          <MotionChip
            id="bahira"
            positionClass="-bottom-4 start-[-1rem] sm:start-[-2rem]"
            bobOffset={0}
            entranceDelay={0.6}
          />
          <MotionChip
            id="shokat"
            positionClass="-top-4 end-[-0.5rem] sm:end-[-1.5rem]"
            bobOffset={0.9}
            entranceDelay={0.8}
          />
        </div>
      </div>
    </section>
  );
}
