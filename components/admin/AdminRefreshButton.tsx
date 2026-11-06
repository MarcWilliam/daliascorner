"use client";

import { RefreshCw } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

type Props = {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AdminRefreshButton({
  onClick,
  loading = false,
  disabled = false,
}: Props) {
  const { locale } = useLocale();
  const label = locale === "ar" ? "تحديث" : "Refresh";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-busy={loading}
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
    >
      <RefreshCw
        aria-hidden="true"
        className={`h-5 w-5 ${loading ? "motion-safe:animate-spin" : ""}`}
      />
    </button>
  );
}
