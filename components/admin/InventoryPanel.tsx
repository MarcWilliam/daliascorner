"use client";
import { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
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
function StockCard({
  stock: s,
  cost,
  costAvailable,
  onSaved,
}: {
  stock: Stock;
  cost?: number | null;
  costAvailable: boolean;
  onSaved: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [operation, setOperation] = useState("add");
  const product = PRODUCTS.find((p) => p.id === s.product_id);
  const category = PRODUCT_CATEGORIES.find((c) => c.id === product?.category);
  async function save(
    name: string,
    args: Record<string, unknown>,
    reset?: () => void,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await storeClient().rpc(name, args);
      if (result.error) throw result.error;
      reset?.();
      await onSaved();
      setMessage(ar ? "تم الحفظ" : "Saved");
    } catch (e) {
      const code =
        typeof e === "object" && e && "message" in e ? String(e.message) : "";
      setError(
        code.includes("STOCK_BELOW_RESERVED")
          ? ar
            ? "لا يمكن أن تكون الكمية أقل من المحجوز للطلبات. ألغِ الطلبات أولاً أو عدّل الكمية."
            : "Stock cannot be lower than the quantity reserved for orders. Cancel those orders first or use a higher count."
          : ar
            ? "تعذر الحفظ. حاول مرة أخرى."
            : "Unable to save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const available = s.on_hand - s.reserved;
  return (
    <article className={panel} aria-busy={busy}>
      <div className="flex items-start gap-4">
        {product ? (
          <img
            src={product.thumb}
            alt=""
            className="h-20 w-20 shrink-0 rounded-2xl border border-line object-cover"
          />
        ) : (
          <Package
            aria-hidden="true"
            className="h-16 w-16 shrink-0 text-brand"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-muted">
            {category?.name[locale] ?? (ar ? "منتج" : "Product")}
          </p>
          <h2 className="mt-1 text-lg">{ar ? s.name_ar : s.name_en}</h2>
          <p className="mt-1 text-sm text-ink-muted">{s.price} EGP</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${!s.active || (!s.unlimited_stock && available <= s.low_stock_threshold) ? "bg-orange/20" : "bg-leaf-soft"}`}
        >
          {!s.active
            ? ar
              ? "متوقف"
              : "Paused"
            : s.unlimited_stock
              ? ar
                ? "غير محدود"
                : "Unlimited"
              : available === 0
                ? ar
                  ? "نفد"
                  : "Sold out"
                : available <= s.low_stock_threshold
                  ? ar
                    ? "مخزون منخفض"
                    : "Low stock"
                  : ar
                    ? "متاح"
                    : "In stock"}
        </span>
      </div>
      <dl className="my-5 grid grid-cols-3 gap-2 rounded-2xl bg-canvas-sunk p-3">
        {[
          [ar ? "في المخزن" : "On hand", s.on_hand],
          [ar ? "محجوز" : "Reserved", s.reserved],
          [ar ? "متاح" : "Available", s.unlimited_stock ? "∞" : available],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-1 text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <fieldset disabled={busy} className="space-y-3">
        <label className="flex min-h-12 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand"
            checked={s.unlimited_stock}
            onChange={(e) =>
              void save("set_inventory_mode", {
                p_product: s.product_id,
                p_unlimited: e.target.checked,
              })
            }
          />
          {ar ? "مخزون غير محدود" : "Unlimited stock"}
        </label>
        {s.unlimited_stock ? (
          <p className="text-sm text-ink-muted">
            {ar
              ? "الطلبات الجديدة لا تخصم من المخزون. عند إيقاف هذا الخيار، راجع كمية المخزون المحفوظة أعلاه."
              : "New orders do not reduce stock. When switching back, check the saved on-hand count above."}
          </p>
        ) : (
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void save(
                "restock_inventory",
                {
                  p_product: s.product_id,
                  p_quantity: Number(f.get("quantity")),
                  p_operation: operation,
                },
                () => form.reset(),
              );
            }}
          >
            <label className="text-sm">
              {ar ? "الإجراء" : "Stock action"}
              <select
                className={field}
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
              >
                <option value="add">{ar ? "إضافة مخزون" : "Add stock"}</option>
                <option value="remove">
                  {ar ? "إزالة مخزون" : "Remove stock"}
                </option>
                <option value="set">
                  {ar ? "تصحيح العدد" : "Set on-hand count"}
                </option>
              </select>
            </label>
            <label className="text-sm">
              {operation === "set"
                ? ar
                  ? "العدد الفعلي"
                  : "Actual count"
                : ar
                  ? "الكمية"
                  : "Quantity"}
              <input
                className={field}
                name="quantity"
                type="number"
                inputMode="numeric"
                min={operation === "set" ? 0 : 1}
                max={10000}
                step={1}
                required
              />
            </label>
            {operation === "set" && (
              <p className="col-span-2 text-xs text-ink-muted">
                {ar
                  ? "أدخل إجمالي القطع الموجودة، بما فيها المحجوز للطلبات."
                  : "Enter all pieces physically on hand, including pieces reserved for orders."}
              </p>
            )}
            <ClayButton type="submit" className="col-span-2" variant="outline">
              {busy
                ? ar
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : ar
                  ? "حفظ المخزون"
                  : "Save stock"}
            </ClayButton>
          </form>
        )}
        <label className="flex min-h-12 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand"
            checked={s.active}
            onChange={(e) =>
              void save("set_inventory_active", {
                p_product: s.product_id,
                p_active: e.target.checked,
              })
            }
          />
          {ar ? "متاح للشراء على الموقع" : "Available for website orders"}
        </label>
        {costAvailable && (
          <section className="border-t border-line pt-3">
            <h3 className="text-sm font-semibold">
              {ar ? "تكلفة القطعة للربح" : "Unit cost for profit tracking"}
            </h3>
            <form
              className="mt-2 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const value = String(f.get("cost") ?? "");
                void save("set_product_unit_cost", {
                  p_product: s.product_id,
                  p_cost: value.trim() === "" ? null : Number(value),
                });
              }}
            >
              <label className="min-w-0 flex-1 text-sm">
                {ar
                  ? "تكلفة القطعة EGP (اختياري)"
                  : "Cost per piece EGP (optional)"}
                <input
                  key={cost ?? "unknown"}
                  className={field}
                  name="cost"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={cost ?? ""}
                />
              </label>
              <ClayButton type="submit" variant="outline">
                {ar ? "حفظ" : "Save"}
              </ClayButton>
            </form>
            <p className="mt-2 text-xs text-ink-muted">
              {ar
                ? "للطلبيات الجديدة فقط. اتركها فارغة إذا كانت غير معروفة."
                : "Applies to new orders. Leave blank when unknown."}
            </p>
          </section>
        )}
      </fieldset>
      {message && (
        <p role="status" className="mt-3 text-sm text-brand">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold">
          {error}
        </p>
      )}
    </article>
  );
}
export function InventoryPanel({
  stock,
  movements,
  loading,
  onRefresh,
}: {
  stock: Stock[];
  movements: Movement[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [filter, setFilter] = useState("all");
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
      };
  return (
    <section
      className="space-y-5"
      aria-label={ar ? "المخزون" : "Stock"}
      aria-busy={loading}
    >
      <div className={panel}>
        <h1 className="text-xl">
          {ar ? "المنتجات والمخزون" : "Products & stock"}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {ar
            ? "أضف القطع الجديدة، صحّح العدد الفعلي، أو اختر مخزوناً غير محدود لكل منتج."
            : "Restock new pieces, correct physical counts, or choose unlimited stock for each product."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {shown.map((s) => (
          <StockCard
            key={s.product_id}
            stock={s}
            cost={costs[s.product_id]}
            costAvailable={costAvailable}
            onSaved={saved}
          />
        ))}
      </div>
      <section className={panel}>
        <h2 className="text-xl">
          {ar ? "آخر حركات المخزون" : "Recent stock activity"}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {ar
            ? "يتم تسجيل عمليات المخزون تلقائياً."
            : "Stock changes are recorded automatically."}
        </p>
        <ul className="mt-3 divide-y divide-line">
          {movements.map((m) => (
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
        {!movements.length && (
          <p className="mt-3 text-sm text-ink-muted">
            {ar
              ? "ستظهر هنا عمليات المخزون والطلبات."
              : "Restocks and order reservations will appear here."}
          </p>
        )}
      </section>
    </section>
  );
}
