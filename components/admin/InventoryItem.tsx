"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Package, Plus } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeClient } from "@/lib/store/client";
import { PRODUCTS, PRODUCT_CATEGORIES } from "@/lib/products";
import type { Stock } from "./InventoryPanel";
import { AdminDialog } from "./AdminDialog";

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
  const [restockOpen, setRestockOpen] = useState(false);
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
      after?.();
      setMessage(ar ? "تم الحفظ" : "Saved");
      try {
        await onSaved();
      } catch {
        setMessage(
          ar
            ? "تم الحفظ. حدّث الصفحة لعرض الأعداد الحالية."
            : "Saved. Refresh to load the latest counts.",
        );
      }
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
      className={
        table ? "min-w-32" : "flex min-w-0 flex-wrap items-center gap-x-3"
      }
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
  const stockControl = (
    <>
      <button
        type="button"
        disabled={busy || s.unlimited_stock}
        onClick={() => {
          setError("");
          setMessage("");
          setRestockOpen(true);
        }}
        aria-label={`${ar ? "تعديل المخزون" : "Restock"} — ${name}`}
        title={
          s.unlimited_stock
            ? ar
              ? "أوقف المخزون غير المحدود لتعديل العدد"
              : "Turn off unlimited stock to change the count"
            : undefined
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-brand disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-brand/35"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {ar ? "تعديل المخزون" : "Restock"}
      </button>
      <AdminDialog
        open={restockOpen}
        onClose={() => setRestockOpen(false)}
        title={`${ar ? "تعديل المخزون" : "Restock"} · ${name}`}
        busy={busy}
      >
        <p className="mb-4 text-sm text-ink-muted">
          {ar ? "بالمخزن" : "On hand"}: {s.on_hand} ·{" "}
          {ar ? "محجوز" : "Reserved"}: {s.reserved}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(
              "restock_inventory",
              {
                p_product: s.product_id,
                p_quantity: Number(quantity),
                p_operation: operation,
              },
              () => {
                setQuantity("");
                setRestockOpen(false);
              },
            );
          }}
        >
          <fieldset
            disabled={busy || s.unlimited_stock}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm">
              {ar ? "الإجراء" : "Stock action"}
              <select
                className="store-field mt-1"
                value={operation}
                aria-label={`${ar ? "الإجراء" : "Stock action"} — ${name}`}
                onChange={(e) => setOperation(e.target.value)}
              >
                <option value="add">{ar ? "إضافة مخزون" : "Add stock"}</option>
                <option value="remove">
                  {ar ? "إزالة مخزون" : "Remove stock"}
                </option>
                <option value="set">{ar ? "تصحيح العدد" : "Set count"}</option>
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
                className="store-field mt-1"
                type="number"
                inputMode="numeric"
                min={operation === "set" ? 0 : 1}
                max={10000}
                step={1}
                required
                value={quantity}
                aria-label={`${operation === "set" ? (ar ? "العدد الفعلي" : "Actual count") : ar ? "الكمية" : "Quantity"} — ${name}`}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {operation === "set" && (
              <p className="text-xs text-ink-muted sm:col-span-2">
                {ar
                  ? "العدد الإجمالي الفعلي بما فيه المحجوز."
                  : "Total pieces physically on hand, including reservations."}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {error}
              </p>
            )}
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-brand px-4 font-semibold text-canvas"
              >
                {busy
                  ? ar
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : ar
                    ? "حفظ المخزون"
                    : "Save stock"}
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl border border-line px-4 text-brand"
                onClick={() => setRestockOpen(false)}
              >
                {ar ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </fieldset>
        </form>
      </AdminDialog>
    </>
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
      <fieldset disabled={busy} className="flex min-w-0 items-center gap-2">
        <label
          className={
            table ? "min-w-0 flex-1" : "flex min-w-0 flex-1 items-center gap-3"
          }
        >
          <span
            className={
              table
                ? "sr-only"
                : "w-20 shrink-0 text-xs font-semibold leading-4"
            }
          >
            {ar ? "تكلفة القطعة (EGP)" : "Unit cost (EGP)"}
          </span>
          <input
            className={`${field} min-w-0`}
            title={
              ar
                ? "للطلبات الجديدة فقط. فارغ يعني غير معروف."
                : "New orders only. Blank means unknown."
            }
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
            className="space-y-3 rounded-xl border border-line bg-surface p-3"
            aria-busy={busy}
          >
            {productInfo}
            {counts}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              {availability}
              {stockControl}
            </div>
            <section>{costForm}</section>
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
        className="min-w-40 px-3 py-3 text-start font-normal align-middle"
      >
        {productInfo}
        {feedback}
      </th>
      <td className="px-3 py-3 align-middle">{counts}</td>
      <td className="px-3 py-3 align-middle">{stockControl}</td>
      <td className="w-40 min-w-36 px-3 py-3 align-middle">{costForm}</td>
      <td className="px-3 py-2 align-middle">{availability}</td>
    </tr>
  );
}
