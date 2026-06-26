"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { PRODUCTS } from "@/lib/products";
import { CharacterCard } from "./CharacterCard";
import { RichText } from "@/components/ui/RichText";
import { Reveal } from "@/components/ui/Reveal";

export function Characters() {
  const { t } = useLocale();
  return (
    <section id="characters" className="section relative scroll-mt-24">
      <div className="container-page">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">
            <RichText text={t("characters.title")} accentClassName="text-clay-deep" />
          </h2>
          <p className="mt-3 text-lg text-ink-muted">{t("characters.intro")}</p>
        </Reveal>

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product, i) => (
            <li key={product.id} className="h-full">
              <Reveal delayMs={i * 100} className="h-full">
                <CharacterCard product={product} />
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
