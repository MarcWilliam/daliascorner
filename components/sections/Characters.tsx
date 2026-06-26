"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { PRODUCTS } from "@/lib/products";
import { CharacterCard } from "./CharacterCard";
import { RichText } from "@/components/ui/RichText";
import { Reveal } from "@/components/ui/Reveal";
import { RevealTitle } from "@/components/ui/RevealTitle";
import { RevealGroup, RevealItem } from "@/components/ui/RevealGroup";

export function Characters() {
  const { t } = useLocale();
  return (
    <section
      id="characters"
      className="section relative scroll-mt-24 bg-canvas-sunk"
    >
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <RevealTitle>
            <h2 className="text-3xl sm:text-4xl">
              <RichText text={t("characters.title")} accentClassName="text-clay-deep" />
            </h2>
          </RevealTitle>
          <Reveal as="p" delayMs={140} className="mt-3 text-lg text-ink-muted">
            {t("characters.intro")}
          </Reveal>
        </div>

        <RevealGroup as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <RevealItem as="li" key={product.id} className="h-full">
              <CharacterCard product={product} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
