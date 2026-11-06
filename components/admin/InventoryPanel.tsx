"use client";
import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, List, Search, History } from "lucide-react";
import { InventoryItem } from "./InventoryItem";
import { AdminDialog } from "./AdminDialog";
import { ClayButton } from "@/components/ui/ClayButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeClient } from "@/lib/store/client";
import { PRODUCTS, PRODUCT_CATEGORIES } from "@/lib/products";
export type Stock = {
  product_id: string;
  name_en: string;
  name_ar: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  price: number;
  unlimited_stock: boolean;
  active: boolean;
};
export type Movement = {
  id: number;
  product_id: string;
  on_hand_delta: number;
  reserved_delta: number;
  reason: string;
  created_at: string;
};
const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
export function InventoryPanel({
  stock,
  movements,
  loading,
  onRefresh,
  initialProduct,
}: {
  stock: Stock[];
  movements: Movement[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  initialProduct?: string;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [view, setView] = useState<"table" | "cards">("cards");
  const [viewReady, setViewReady] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<Set<string>>(
    () => new Set(),
  );
  const onBusyChange = useCallback((id: string, busy: boolean) => {
    setPendingProducts((previous) => {
      if (previous.has(id) === busy) return previous;
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("dc.admin.stock-view");
    } catch {}
    setView(
      saved === "table" || saved === "cards"
        ? saved
        : window.matchMedia("(min-width: 768px)").matches
          ? "table"
          : "cards",
    );
    setViewReady(true);
  }, []);
  useEffect(() => {
    if (viewReady) {
      try {
        localStorage.setItem("dc.admin.stock-view", view);
      } catch {}
    }
  }, [view, viewReady]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    if (initialProduct) {
      setSearch(initialProduct);
      setCategory("all");
      setFilter("all");
    }
  }, [initialProduct]);
  const [costs, setCosts] = useState<Record<string, number | null>>({}),
    [costAvailable, setCostAvailable] = useState(false),
    [costError, setCostError] = useState(false),
    [costLoading, setCostLoading] = useState(false);
  async function loadCosts() {
    setCostLoading(true);
    setCostError(false);
    const r = await storeClient()
      .from("product_costs")
      .select("product_id,unit_cost");
    if (!r.error) {
      setCosts(
        Object.fromEntries(
          r.data.map((row) => [
            row.product_id,
            row.unit_cost == null ? null : Number(row.unit_cost),
          ]),
        ),
      );
      setCostAvailable(true);
    } else {
      setCostError(true);
    }
    setCostLoading(false);
  }
  useEffect(() => {
    void loadCosts();
  }, []);
  async function saved() {
    await Promise.all([onRefresh(), loadCosts()]);
  }
  const shown = stock.filter((s) => {
    const p = PRODUCTS.find((p) => p.id === s.product_id);
    return (
      `${s.name_en} ${s.name_ar} ${s.product_id}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()) &&
      (category === "all" || p?.category === category) &&
      (filter === "all" ||
        (filter === "unlimited" && s.unlimited_stock) ||
        (filter === "paused" && !s.active) ||
        (filter === "low" &&
          s.active &&
          !s.unlimited_stock &&
          s.on_hand - s.reserved <= s.low_stock_threshold))
    );
  });
  const shownMovements = movements.filter((m) => {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(m.created_at));
    return (
      (historyProduct === "all" || m.product_id === historyProduct) &&
      (!historyFrom || day >= historyFrom) &&
      (!historyTo || day <= historyTo)
    );
  });
  const reasons: Record<string, string> = ar
    ? {
        restocked: "إضافة مخزون",
        stock_removed: "إزالة مخزون",
        stock_count_corrected: "تصحيح العدد",
        unlimited_enabled: "تفعيل مخزون غير محدود",
        tracked_enabled: "تفعيل تتبع المخزون",
        order_reserved: "حجز طلب",
        shipped: "شحن طلب",
        cancelled: "إلغاء طلب",
        expired: "انتهاء حجز",
        past_order_deducted: "خصم مخزون طلب سابق",
        admin_items_removed: "إزالة منتجات من الطلب",
        admin_items_added: "إضافة منتجات أو بدائل",
        partial_shipment: "شحن الكمية المحددة",
        shipment_remainder_released: "تحرير حجز الكمية غير المشحونة",
        returned_restocked: "إعادة مرتجع للمخزون",
        admin_cancelled_remainder: "إلغاء الكمية المتبقية",
        order_reopened: "إعادة حجز طلب مفتوح",
        shipment_recording_corrected: "تصحيح تسجيل شحنة",
      }
    : {
        restocked: "Stock added",
        stock_removed: "Stock removed",
        stock_count_corrected: "Stock count corrected",
        unlimited_enabled: "Unlimited stock enabled",
        tracked_enabled: "Stock tracking enabled",
        order_reserved: "Reserved for order",
        shipped: "Order shipped",
        cancelled: "Order cancelled",
        expired: "Reservation expired",
        past_order_deducted: "Past order stock deducted",
        admin_items_removed: "Order items removed",
        admin_items_added: "Items or replacements added",
        partial_shipment: "Selected quantities shipped",
        shipment_remainder_released: "Unshipped reservations released",
        returned_restocked: "Returned goods restocked",
        admin_cancelled_remainder: "Outstanding quantities cancelled",
        order_reopened: "Reopened order reserved",
        shipment_recording_corrected: "Shipment recording corrected",
      };
  return (
    <section
      className="space-y-5"
      aria-label={ar ? "المخزون" : "Stock"}
      aria-busy={loading}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-brand focus-visible:ring-4 focus-visible:ring-brand/35"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {ar ? "سجل المخزون" : "View stock history"}
          </button>
          <div
            className="inline-flex rounded-xl border border-line bg-canvas-sunk p-1"
            role="group"
            aria-label={ar ? "طريقة عرض المخزون" : "Stock view"}
          >
            {(
              [
                { value: "table", label: ar ? "جدول" : "Table", Icon: List },
                {
                  value: "cards",
                  label: ar ? "بطاقات" : "Cards",
                  Icon: LayoutGrid,
                },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                disabled={pendingProducts.size > 0}
                onClick={() => setView(value)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 ${view === value ? "bg-surface text-brand shadow-clay-sm" : "text-ink-muted hover:text-brand"}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              {ar ? "بحث عن منتج" : "Find a product"}
            </span>
            <input
              className={field}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </label>
          <label className="text-sm">
            {ar ? "الفئة" : "Category"}
            <select
              className={field}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">{ar ? "كل الفئات" : "All categories"}</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {ar ? "حالة المخزون" : "Stock status"}
            <select
              className={field}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{ar ? "كل المنتجات" : "All products"}</option>
              <option value="low">
                {ar ? "منخفض أو نفد" : "Low or sold out"}
              </option>
              <option value="unlimited">
                {ar ? "غير محدود" : "Unlimited"}
              </option>
              <option value="paused">{ar ? "متوقف" : "Paused"}</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-ink-muted" role="status">
          {loading
            ? ar
              ? "جارٍ تحديث المخزون…"
              : "Updating stock…"
            : `${shown.length} / ${stock.length} ${ar ? "منتجات" : "products"}`}
        </p>
      </div>
      {costError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
        >
          <p className="text-sm">
            {ar
              ? "تعذر تحميل تكلفة المنتجات. يمكنك متابعة إدارة المخزون."
              : "Product costs could not be loaded. Stock controls are still available."}
          </p>
          <ClayButton
            variant="outline"
            disabled={costLoading}
            onClick={() => void loadCosts()}
          >
            {ar ? "إعادة تحميل التكاليف" : "Retry costs"}
          </ClayButton>
        </div>
      )}
      {!loading && !shown.length && (
        <p className={panel}>
          {stock.length
            ? ar
              ? "لا توجد منتجات تطابق البحث. جرّب تغيير الفلاتر."
              : "No products match. Try another search or filter."
            : ar
              ? "لا توجد منتجات مخزون حتى الآن."
              : "No inventory products are available yet."}
        </p>
      )}
      {view === "table" && (
        <p className="text-xs text-ink-muted">
          {ar
            ? "التكلفة للقطعة بالجنيه وللطلبات الجديدة فقط؛ اتركها فارغة إن لم تكن معروفة."
            : "Unit costs are EGP per piece and apply to new orders only; leave blank when unknown."}
          <span className="ms-2">
            {ar
              ? "مرّر الجدول أفقيًا لرؤية كل الأعمدة."
              : "Scroll sideways to see all columns."}
          </span>
        </p>
      )}
      <div
        className={
          view === "table"
            ? "max-w-full overflow-x-auto rounded-2xl border border-line bg-surface shadow-clay-sm [contain:paint]"
            : ""
        }
        role={view === "table" ? "region" : undefined}
        aria-label={
          view === "table"
            ? ar
              ? "جدول المنتجات والمخزون"
              : "Products and stock table"
            : undefined
        }
        tabIndex={view === "table" ? 0 : undefined}
      >
        <table
          role={view === "cards" ? "presentation" : undefined}
          className={
            view === "table"
              ? "w-full min-w-[52rem] border-collapse text-sm"
              : "block w-full"
          }
        >
          <caption className="sr-only">
            {ar
              ? "المنتجات والمخزون والتكلفة"
              : "Products, stock and unit costs"}
          </caption>
          <thead
            hidden={view === "cards"}
            className="border-b border-line bg-canvas-sunk text-start text-xs text-ink-muted"
          >
            <tr>
              {[
                ar ? "المنتج" : "Product",
                ar ? "الكميات" : "Quantities",
                ar ? "تحديث المخزون" : "Update stock",
                ar ? "تكلفة القطعة EGP" : "Unit cost EGP",
                ar ? "الإتاحة" : "Availability",
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-3 text-start font-semibold"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            role={view === "cards" ? "presentation" : undefined}
            className={
              view === "cards"
                ? "grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3"
                : ""
            }
          >
            {shown.map((s) => (
              <InventoryItem
                key={s.product_id}
                stock={s}
                cost={costs[s.product_id]}
                costAvailable={costAvailable}
                onSaved={saved}
                view={view}
                onBusyChange={onBusyChange}
              />
            ))}
          </tbody>
        </table>
      </div>
      <AdminDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={ar ? "سجل المخزون" : "Stock history"}
        variant="drawer"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            {ar ? "المنتج" : "Product"}
            <select
              className="store-field mt-1"
              value={historyProduct}
              onChange={(e) => setHistoryProduct(e.target.value)}
            >
              <option value="all">{ar ? "كل المنتجات" : "All products"}</option>
              {stock.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {ar ? p.name_ar : p.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {ar ? "من" : "From"}
            <input
              type="date"
              className="store-field mt-1"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {ar ? "إلى" : "To"}
            <input
              type="date"
              className="store-field mt-1"
              min={historyFrom || undefined}
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
            />
          </label>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {ar
            ? "يُعرض أحدث سجل محمّل فقط. التواريخ بتوقيت القاهرة."
            : "Filters apply to loaded recent activity only. Dates use Cairo time."}
        </p>
        <ul className="mt-3 divide-y divide-line">
          {shownMovements.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <div>
                <p className="font-semibold">
                  {stock.find((s) => s.product_id === m.product_id)?.[
                    ar ? "name_ar" : "name_en"
                  ] ?? m.product_id}
                </p>
                <p className="mt-1 text-ink-muted">
                  {reasons[m.reason] ?? m.reason}
                  {m.on_hand_delta !== 0 &&
                    ` · ${m.on_hand_delta > 0 ? "+" : ""}${m.on_hand_delta} ${ar ? "في المخزن" : "on hand"}`}
                  {m.reserved_delta !== 0 &&
                    ` · ${m.reserved_delta > 0 ? "+" : ""}${m.reserved_delta} ${ar ? "محجوز" : "reserved"}`}
                </p>
              </div>
              <time className="text-xs text-ink-muted" dateTime={m.created_at}>
                {new Date(m.created_at).toLocaleString(ar ? "ar-EG" : "en-GB", {
                  timeZone: "Africa/Cairo",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ul>
        {!shownMovements.length && (
          <p className="mt-3 text-sm text-ink-muted">
            {ar
              ? "لا توجد حركات محمّلة تطابق الفلاتر."
              : "No loaded activity matches these filters."}
          </p>
        )}
      </AdminDialog>
    </section>
  );
}
