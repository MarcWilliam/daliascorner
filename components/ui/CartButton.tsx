"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { useLocale } from "@/components/providers/LocaleProvider";

export function CartButton({ className = "" }: { className?: string }) {
  const { count, open } = useCart();
  const { t } = useLocale();

  return (
    <button
      type="button"
      onClick={open}
      aria-label={
        count > 0
          ? `${t("cart.open")} — ${
              count === 1 ? t("cart.itemsOne") : t("cart.itemsOther", { count })
            }`
          : t("cart.open")
      }
      className={`relative inline-grid h-11 w-11 place-items-center rounded-clay border-2 border-line bg-surface text-ink shadow-clay-sm transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer ${className}`}
    >
      <ShoppingBag className="h-[1.3rem] w-[1.3rem] text-brand" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="tabular absolute -top-2 grid min-h-[1.25rem] min-w-[1.25rem] place-items-center rounded-full bg-orange px-1 text-xs font-bold leading-none text-ink shadow-clay-sm"
          style={{ insetInlineEnd: "-0.5rem" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
