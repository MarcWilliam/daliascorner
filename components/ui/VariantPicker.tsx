"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getProductName, getProductVariants, type Product } from "@/lib/products";
import { productPath } from "@/lib/config";
import { asset } from "@/lib/asset";

/** Photo choices work for both colour changes and differently named designs. */
export function VariantPicker({
  product,
  onSelect,
}: {
  product: Product;
  /** Cards select in place; detail pages link to each version's own stable URL. */
  onSelect?: (product: Product) => void;
}) {
  const { locale, t } = useLocale();
  const id = useId();
  const variants = getProductVariants(product);
  if (variants.length < 2) return null;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-display text-sm font-semibold text-ink">
        {t("product.chooseVariant")}
      </legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const selected = variant.id === product.id;
          const label = variant.variantLabel?.[locale] ?? variant.name[locale];
          const content = (
            <>
              <img
                src={variant.thumb}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
              <span className="min-w-0 flex-1 break-words text-start">{label}</span>
              <Check
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 ${selected ? "visible" : "invisible"}`}
              />
            </>
          );
          const style = `inline-flex min-h-14 max-w-full items-center gap-2 rounded-2xl border-2 p-1.5 pe-2.5 font-display text-sm font-semibold transition-colors [touch-action:manipulation] ${
            selected
              ? "border-brand bg-canvas-sunk text-brand"
              : "border-line bg-surface text-ink hover:border-brand/50"
          }`;

          return onSelect ? (
            <label key={variant.id} className="relative max-w-full cursor-pointer">
              <input
                type="radio"
                name={id}
                value={variant.id}
                checked={selected}
                onChange={() => onSelect(variant)}
                aria-label={getProductName(variant, locale)}
                className="peer sr-only"
              />
              <span className={`${style} peer-focus-visible:ring-4 peer-focus-visible:ring-brand/45 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface`}>
                {content}
              </span>
            </label>
          ) : (
            <a
              key={variant.id}
              href={asset(productPath(variant.id))}
              aria-label={getProductName(variant, locale)}
              aria-current={selected ? "page" : undefined}
              className={`${style} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
            >
              {content}
            </a>
          );
        })}
      </div>
    </fieldset>
  );
}
