"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { t, locale, toggleLocale } = useLocale();
  // The label is the OTHER language's name in its own script — tag it with that
  // locale so AT and the browser switch pronunciation/font for the foreign word.
  const other = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={t("lang.toggleAria")}
      className={`inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-clay border-2 border-line bg-surface px-3.5 py-2 font-display text-sm font-semibold text-ink shadow-clay-sm transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer ${className}`}
    >
      <Languages className="h-[1.15rem] w-[1.15rem] text-brand" aria-hidden="true" />
      {/* Shows the OTHER language's name, in its own script */}
      <span lang={other}>{t("lang.switch")}</span>
    </button>
  );
}
