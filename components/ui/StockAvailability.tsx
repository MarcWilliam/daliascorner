"use client";
import { useInventory } from "@/components/providers/InventoryProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { STORE_CONFIGURED } from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";
export function StockAvailability({ id }: { id: string }) {
  const { items, loading } = useInventory();
  const { locale } = useLocale();
  const c = storeCopy[locale];
  if (!STORE_CONFIGURED) return null;
  return (
    <p className="my-2 text-sm text-ink-muted" aria-live="polite">
      {loading
        ? c.stockChecking
        : items[id]
          ? items[id].available > 0
            ? `${items[id].available} ${c.units}`
            : c.outOfStock
          : c.stockUnavailable}
    </p>
  );
}
