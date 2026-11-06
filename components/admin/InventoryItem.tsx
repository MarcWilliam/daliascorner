"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Package } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeClient } from "@/lib/store/client";
import { PRODUCTS, PRODUCT_CATEGORIES } from "@/lib/products";
import type { Stock } from "./InventoryPanel";

type Props = {
  stock: Stock;
  cost?: number | null;
  costAvailable: boolean;
  view: "table" | "cards";
  onSaved: () => Promise<void>;
  onBusyChange: (id: string, busy: boolean) => void;
};
const field = "store-field";
const saveButton =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand hover:bg-canvas-sunk disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45";

/** One mounted controller per product; view changes preserve every unsaved input. */
export function InventoryItem({
  stock: s,
  cost,
  costAvailable,
  view,
  onSaved,
  onBusyChange,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const table = view === "table";
  const name = ar ? s.name_ar : s.name_en;
  const product = PRODUCTS.find((p) => p.id === s.product_id);
  const category = PRODUCT_CATEGORIES.find((c) => c.id === product?.category);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const busyRef = useRef(false);
  const [operation, setOperation] = useState("add"),
    [quantity, setQuantity] = useState("");
  const [costDraft, setCostDraft] = useState(cost == null ? "" : String(cost));
  const costEdited = useRef(false);
  useEffect(() => {
    if (!costEdited.current) setCostDraft(cost == null ? "" : String(cost));
  }, [cost]);
  useEffect(
    () => () => onBusyChange(s.product_id, false),
    [s.product_id, onBusyChange],
  );
  const available = s.on_hand - s.reserved;
  const label = !s.active
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
            : "In stock";
  const warning =
    !s.active || (!s.unlimited_stock && available <= s.low_stock_threshold);
  async function save(
    rpc: string,
    args: Record<string, unknown>,
    after?: () => void,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange(s.product_id, true);
    setError("");
    setMessage("");
    try {
      const result = await storeClient().rpc(rpc, args);
      if (result.error) throw result.error;
      await onSaved();
      after?.();
      setMessage(ar ? "تم الحفظ" : "Saved");
    } catch (failure) {
      const code =
        typeof failure === "object" && failure && "message" in failure
          ? String(failure.message)
          : "";
      setError(
        code.includes("STOCK_BELOW_RESERVED")
          ? ar
            ? "لا يمكن أن يقل العدد عن المحجوز للطلبات. استخدم عددًا أكبر أو ألغِ الطلبات أولًا."
            : "The count cannot be below reserved stock. Use a higher count or cancel those orders first."
          : ar
            ? "تعذر الحفظ. حاول مرة أخرى."
            : "Unable to save. Please try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChange(s.product_id, false);
    }
  }
  const productInfo = (
    <div className="flex items-center gap-3">
      {product ? (
        <img
          src={product.thumb}
          width={48}
          height={48}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl border border-line object-cover"
        />
      ) : (
        <Package aria-hidden="true" className="h-10 w-10 shrink-0 text-brand" />
      )}
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">
          {category?.name[locale] ?? (ar ? "منتج" : "Product")}
        </p>
        <h2 className="mt-0.5 text-base">{name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-muted">{s.price} EGP</span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${warning ? "bg-orange/20" : "bg-leaf-soft"}`}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
  const counts = (
    <dl
      className={`grid grid-cols-3 gap-3 text-center ${table ? "min-w-32" : "rounded-xl bg-canvas-sunk px-3 py-2"}`}
    >
      {[
        [ar ? "بالمخزن" : "On hand", s.on_hand],
        [ar ? "محجوز" : "Reserved", s.reserved],
        [ar ? "متاح" : "Available", s.unlimited_stock ? "∞" : available],
      ].map(([caption, value]) => (
        <div key={String(caption)}>
          <dt className="whitespace-nowrap text-[11px] text-ink-muted">
            {caption}
          </dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
  const availability = (
    <fieldset
      disabled={busy}
      className={table ? "min-w-32" : "grid grid-cols-2 gap-x-3"}
    >
      <legend className="sr-only">
        {ar ? "إتاحة" : "Availability"} — {name}
      </legend>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-brand"
          checked={s.unlimited_stock}
          aria-label={`${ar ? "مخزون غير محدود" : "Unlimited stock"} — ${name}`}
          onChange={(event) =>
            void save("set_inventory_mode", {
              p_product: s.product_id,
              p_unlimited: event.target.checked,
            })
          }
        />
        <span>{ar ? "غير محدود" : "Unlimited"}</span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-brand"
          checked={s.active}
          aria-label={`${ar ? "متاح للشراء على الموقع" : "Available for website orders"} — ${name}`}
          onChange={(event) =>
            void save("set_inventory_active", {
              p_product: s.product_id,
              p_active: event.target.checked,
            })
          }
        />
        <span>{ar ? "متاح للطلب" : "Available"}</span>
      </label>
    </fieldset>
  );
  const stockForm = s.unlimited_stock ? (
    <p className="max-w-xs text-xs leading-5 text-ink-muted">
      {ar
        ? "الطلبات غير المحدودة لا تغيّر العدد المحفوظ. راجع العدد قبل إعادة تفعيل التتبع."
        : "Unlimited orders leave the stored count unchanged. Check it before switching back."}
    </p>
  ) : (
    <form
      aria-label={`${ar ? "تحديث المخزون" : "Update stock"} — ${name}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          "restock_inventory",
          {
            p_product: s.product_id,
            p_quantity: Number(quantity),
            p_operation: operation,
          },
          () => setQuantity(""),
        );
      }}
    >
      <fieldset disabled={busy} className="flex items-end gap-2">
        <label className={table ? "w-40 shrink-0" : "min-w-0 flex-1"}>
          <span
            className={table ? "sr-only" : "mb-1 block text-xs text-ink-muted"}
          >
            {ar ? "الإجراء" : "Stock action"}
          </span>
          <select
            className={field}
            value={operation}
            aria-label={`${ar ? "الإجراء" : "Stock action"} — ${name}`}
            onChange={(event) => setOperation(event.target.value)}
          >
            <option value="add">{ar ? "إضافة مخزون" : "Add stock"}</option>
            <option value="remove">
              {ar ? "إزالة مخزون" : "Remove stock"}
            </option>
            <option value="set">{ar ? "تصحيح العدد" : "Set count"}</option>
          </select>
        </label>
        <label className="w-20 shrink-0">
          <span
            className={table ? "sr-only" : "mb-1 block text-xs text-ink-muted"}
          >
            {operation === "set"
              ? ar
                ? "العدد"
                : "Count"
              : ar
                ? "الكمية"
                : "Quantity"}
          </span>
          <input
            className={field}
            type="number"
            inputMode="numeric"
            min={operation === "set" ? 0 : 1}
            max={10000}
            step={1}
            required
            value={quantity}
            aria-label={`${operation === "set" ? (ar ? "العدد الفعلي" : "Actual count") : ar ? "الكمية" : "Quantity"} — ${name}`}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={saveButton}
          aria-label={`${ar ? "حفظ المخزون" : "Save stock"} — ${name}`}
          title={ar ? "حفظ المخزون" : "Save stock"}
        >
          <Check aria-hidden="true" className="h-5 w-5" />
        </button>
      </fieldset>
      {operation === "set" && (
        <p className="mt-1 max-w-xs text-[11px] leading-4 text-ink-muted">
          {ar
            ? "إجمالي القطع الموجودة، بما فيها المحجوز."
            : "All pieces on hand, including reserved pieces."}
        </p>
      )}
    </form>
  );
  const costForm = costAvailable ? (
    <form
      aria-label={`${ar ? "تكلفة القطعة" : "Unit cost"} — ${name}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          "set_product_unit_cost",
          {
            p_product: s.product_id,
            p_cost: costDraft.trim() === "" ? null : Number(costDraft),
          },
          () => {
            costEdited.current = false;
          },
        );
      }}
    >
      <fieldset disabled={busy} className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span
            className={table ? "sr-only" : "mb-1 block text-sm font-semibold"}
          >
            {ar ? "تكلفة القطعة EGP (اختياري)" : "Unit cost EGP (optional)"}
          </span>
          <input
            className={field}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={costDraft}
            aria-label={`${ar ? "تكلفة القطعة EGP (اختياري)" : "Unit cost EGP (optional)"} — ${name}`}
            placeholder="—"
            onChange={(event) => {
              costEdited.current = true;
              setCostDraft(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          className={saveButton}
          aria-label={`${ar ? "حفظ التكلفة" : "Save cost"} — ${name}`}
          title={ar ? "حفظ التكلفة" : "Save cost"}
        >
          <Check aria-hidden="true" className="h-5 w-5" />
        </button>
      </fieldset>
      {!table && (
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {ar
            ? "للطلبات الجديدة فقط. فارغ يعني غير معروف."
            : "New orders only. Blank means unknown."}
        </p>
      )}
    </form>
  ) : (
    <p className="text-xs text-ink-muted">
      {ar ? "التكلفة غير متاحة" : "Cost unavailable"}
    </p>
  );
  const feedback = (
    <>
      {busy && (
        <p role="status" className="mt-2 text-xs text-ink-muted">
          {ar ? "جارٍ الحفظ…" : "Saving…"}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs font-semibold text-brand">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 max-w-xs text-xs leading-5 text-destructive"
        >
          {error}
        </p>
      )}
    </>
  );
  if (!table)
    return (
      <tr role="presentation" className="block min-w-0">
        <td role="presentation" colSpan={5} className="block w-full">
          <article
            className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-clay-sm"
            aria-busy={busy}
          >
            {productInfo}
            {counts}
            {availability}
            {stockForm}
            <section className="border-t border-line pt-3">{costForm}</section>
            {feedback}
          </article>
        </td>
      </tr>
    );
  return (
    <tr
      className="border-b border-line last:border-b-0 even:bg-canvas/30"
      aria-busy={busy}
    >
      <th
        scope="row"
        className="min-w-48 px-3 py-3 text-start font-normal align-middle"
      >
        {productInfo}
        {feedback}
      </th>
      <td className="px-3 py-3 align-middle">{counts}</td>
      <td className="min-w-[20rem] px-3 py-3 align-middle">{stockForm}</td>
      <td className="min-w-44 px-3 py-3 align-middle">{costForm}</td>
      <td className="px-3 py-2 align-middle">{availability}</td>
    </tr>
  );
}
