"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import {
  PRODUCT_CATEGORIES,
  getProductsByCategory,
} from "@/lib/products";
import { CharacterCard } from "./CharacterCard";
import { RichText } from "@/components/ui/RichText";
import { Reveal } from "@/components/ui/Reveal";
import { RevealTitle } from "@/components/ui/RevealTitle";
import { RevealGroup, RevealItem } from "@/components/ui/RevealGroup";

export function Characters() {
  const { t, locale } = useLocale();
  return (
    <section
      id="characters"
      className="section relative scroll-mt-24 bg-canvas-sunk"
    >
      <div className="container-page">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <RevealTitle>
            <h2 className="text-3xl sm:text-4xl">
              <RichText text={t("characters.title")} accentClassName="text-clay-deep" />
            </h2>
          </RevealTitle>
          <Reveal as="p" delayMs={140} className="mt-3 text-lg text-ink-muted">
            {t("characters.intro")}
          </Reveal>
        </div>

        <nav
          aria-label={t("characters.collectionNav")}
          className="mx-auto mb-14 flex max-w-2xl flex-wrap justify-center gap-3"
        >
          {PRODUCT_CATEGORIES.map((category) => {
            const count = getProductsByCategory(category.id).length;
            return (
              <a
                key={category.id}
                href={`#collection-${category.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-display text-sm font-semibold text-ink shadow-clay-sm transition-colors hover:border-brand/40 hover:bg-canvas focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
              >
                {category.name[locale]}
                <span className="tabular rounded-full bg-canvas-sunk px-2 py-0.5 text-xs text-ink-muted">
                  {count}
                </span>
              </a>
            );
          })}
        </nav>

        <div className="space-y-16 sm:space-y-20">
          {PRODUCT_CATEGORIES.map((category) => {
            const products = getProductsByCategory(category.id);
            const isNewCollection = category.id === "ultra-small";

            return (
              <section
                key={category.id}
                id={`collection-${category.id}`}
                aria-labelledby={`collection-${category.id}-title`}
                className={`scroll-mt-28 ${
                  isNewCollection
                    ? "relative isolate overflow-hidden rounded-clay-lg border border-mauve/25 bg-mauve-soft/55 p-5 shadow-photo sm:p-8 lg:p-10"
                    : ""
                }`}
              >
                {isNewCollection && (
                  <div
                    aria-hidden="true"
                    className="absolute -end-16 -top-20 -z-10 h-56 w-56 rounded-full bg-orange/15 blur-2xl"
                  />
                )}

                <Reveal className="mb-7 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-clay-deep">
                      {category.eyebrow[locale]}
                    </p>
                    <h3
                      id={`collection-${category.id}-title`}
                      className="mt-1 text-2xl sm:text-3xl"
                    >
                      {category.name[locale]}
                    </h3>
                    <p className="mt-2 leading-relaxed text-ink-muted">
                      {category.intro[locale]}
                    </p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full border border-brand/15 bg-surface/80 px-3 py-1.5 font-display text-xs font-bold text-brand">
                    {products.length} {t("characters.pieces")}
                  </span>
                </Reveal>

                <RevealGroup
                  as="ul"
                  className={`grid gap-6 sm:grid-cols-2 ${
                    isNewCollection ? "lg:mx-auto lg:max-w-4xl" : "lg:grid-cols-3"
                  }`}
                >
                  {products.map((product) => (
                    <RevealItem as="li" key={product.id} className="h-full">
                      <CharacterCard product={product} />
                    </RevealItem>
                  ))}
                </RevealGroup>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
