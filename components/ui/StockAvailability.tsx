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
  const available = items[id]?.available;
  if (available == null || available > 3 || (loading && !items[id]))
    return null;
  return (
    <p className="my-2 text-sm font-semibold text-ink-muted" aria-live="polite">
      {available === 0
        ? c.outOfStock
        : locale === "ar"
          ? `متبقي ${available} فقط`
          : `Only ${available} left`}
    </p>
  );
}
