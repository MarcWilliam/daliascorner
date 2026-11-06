"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Package, Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { storeClient } from "@/lib/store/client";
import { PRODUCTS, PRODUCT_CATEGORIES } from "@/lib/products";
import { manualOrderCopy } from "@/lib/store/manual-order-copy";
import {
  cairoDay,
  pastOrderDates,
  originalUnitCost,
  manualOrderPricePreview,
} from "@/lib/store/manual-order-history";
import { instaPayConfigured } from "@/lib/store/instapay";
import { storeCopy } from "@/lib/store/copy";
import { parseOrder } from "@/lib/store/validation";
import {
  manualOrderAttempt,
  type ManualOrderAttempt,
} from "@/lib/store/manual-order-attempt";
import type { Stock } from "./InventoryPanel";

type Zone = {
  id: string;
  name_en: string;
  name_ar: string;
  fee: number;
  active: boolean;
};
type Line = { id: string; qty: number; unitCost?: string };
type Receipt = {
  order_number: number;
  total: number;
  subtotal: number;
  delivery_fee: number;
  status:
    | "pending"
    | "confirmed"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "expired";
  payment_status: "unpaid" | "paid" | "refunded";
  ordered_at?: string;
  is_historical?: boolean;
  stock_handling?: "already_accounted" | "deduct_now";
};
const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";

export function ManualOrderForm({
  actorId,
  stock,
  onSaved,
  onCancel,
  onViewOrder,
}: {
  actorId: string;
  stock: Stock[];
  onSaved: () => Promise<void>;
  onCancel?: () => void;
  onViewOrder?: (orderNumber: number) => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = manualOrderCopy[locale];
  const [mode, setMode] = useState<"new" | "past">("new");
  const isPast = mode === "past";
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [orderedOn, setOrderedOn] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [stockHandling, setStockHandling] = useState<
    "already_accounted" | "deduct_now"
  >("already_accounted");
  const [confirmedPriceKey, setConfirmedPriceKey] = useState("");
  const today = cairoDay();
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [productId, setProductId] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [payment, setPayment] = useState("cash");
  const [paid, setPaid] = useState(false);
  const [trackingToken, setTrackingToken] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const attempt = useRef<ManualOrderAttempt | null>(null);
  const submitting = useRef(false);
  const trackingInput = useRef<HTMLInputElement>(null);
  const storageKey = `dc.admin.chat-order-attempt.${actorId}`;
  const [methods, setMethods] = useState({ cash: false, transfer: false });
  const [options, setOptions] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const loadOptions = useCallback(async () => {
    setOptions("loading");
    try {
      const db = storeClient();
      const [z, s] = await Promise.all([
        db
          .from("delivery_zones")
          .select("id,name_en,name_ar,fee,active")
          .order("name_en"),
        db
          .from("checkout_settings")
          .select(
            "cash_enabled,transfer_enabled,transfer_instructions,instapay_link,instapay_number",
          )
          .single(),
      ]);
      if (z.error || s.error || !s.data) throw Error();
      setZones(z.data);
      setZoneId((value) =>
        z.data.some(
          (item) =>
            item.id === value && (modeRef.current === "past" || item.active),
        )
          ? value
          : "",
      );
      const enabled = {
        cash: !!s.data.cash_enabled,
        transfer: !!s.data.transfer_enabled && instaPayConfigured(s.data),
      };
      setMethods(enabled);
      setPayment((value) =>
        modeRef.current === "past"
          ? value
          : value === "cash" && enabled.cash
            ? "cash"
            : value === "transfer" && enabled.transfer
              ? "transfer"
              : enabled.cash
                ? "cash"
                : "transfer",
      );
      setOptions("ready");
    } catch {
      setOptions("error");
    }
  }, []);
  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);
  useEffect(() => {
    if (receipt) savedHeading.current?.focus();
  }, [receipt]);
  const activeProducts = stock.filter((product) => isPast || product.active);
  const availableZones = zones.filter((zone) => isPast || zone.active);
  const newHasPausedProducts =
    !isPast &&
    lines.some(
      (line) =>
        !stock.find((product) => product.product_id === line.id)?.active,
    );
  function changeMode(value: "new" | "past") {
    setMode(value);
    setPaid(value === "past");
    setProductId("");
    setConfirmedPriceKey("");
    setError("");
    if (value === "new") {
      setZoneId((current) =>
        zones.some((zone) => zone.id === current && zone.active) ? current : "",
      );
      setPayment((current) =>
        current === "cash" && methods.cash
          ? "cash"
          : current === "transfer" && methods.transfer
            ? "transfer"
            : methods.cash
              ? "cash"
              : "transfer",
      );
    }
  }
  const productGroups = [
    ...PRODUCT_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.name[locale],
      products: activeProducts.filter(
        (product) =>
          PRODUCTS.find((p) => p.id === product.product_id)?.category ===
          category.id,
      ),
    })),
    {
      id: "other",
      label: c.otherProducts,
      products: activeProducts.filter(
        (product) => !PRODUCTS.some((p) => p.id === product.product_id),
      ),
    },
  ];
  const selectedZone = availableZones.find((zone) => zone.id === zoneId);
  const preview = manualOrderPricePreview(
    lines,
    Object.fromEntries(
      stock.map((product) => [product.product_id, Number(product.price)]),
    ),
    selectedZone,
  );
  const subtotal = preview.subtotal;
  const originalConfirmed = confirmedPriceKey === preview.confirmationKey;
  // A changed item, quantity, zone or current price needs a fresh acknowledgement.
  useEffect(() => {
    setConfirmedPriceKey("");
  }, [preview.confirmationKey]);
  const configured =
    options === "ready" &&
    availableZones.length > 0 &&
    (isPast || methods.cash || methods.transfer);
  function addProduct() {
    if (!productId) return;
    setLines((current) =>
      current.some((line) => line.id === productId)
        ? current
        : [...current, { id: productId, qty: 1 }],
    );
    setProductId("");
    setError("");
  }
  function reset() {
    setCustomer({ name: "", phone: "", address: "" });
    setLines([]);
    setZoneId("");
    setReceipt(null);
    setPaid(isPast);
    setOrderedOn("");
    setPaidOn("");
    setStockHandling("already_accounted");
    setConfirmedPriceKey("");
    setTrackingToken("");
    setCopyMessage("");
    attempt.current = null;
    setError("");
    setWarning("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!lines.length) {
      setError(c.addFirst);
      return;
    }
    if (!configured || !selectedZone) {
      setError(c.validation);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const canonical = parseOrder({
        key: crypto.randomUUID(),
        customer,
        lines,
        locale,
      });
      if (isPast && !originalConfirmed)
        throw Error("ORIGINAL_CONFIRMATION_REQUIRED");
      const history = isPast
        ? pastOrderDates(orderedOn, paid, paidOn, today)
        : null;
      const orderLines = canonical.lines.map((line) => {
        const cost = isPast
          ? originalUnitCost(
              lines.find((item) => item.id === line.id)?.unitCost ?? "",
            )
          : undefined;
        return { ...line, ...(cost !== undefined ? { unit_cost: cost } : {}) };
      });
      const payload = {
        customer: canonical.customer,
        lines: orderLines,
        locale: canonical.locale,
        zone: zoneId,
        payment,
        paid,
        ...(history
          ? {
              mode: "past",
              orderedOn: history.orderedOn,
              paidOn: history.paidOn,
              stockHandling,
              expectedTotal: preview.total,
            }
          : {}),
      };
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify({ actor: actorId, ...payload }),
        ),
      );
      const fingerprint = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      let persisted: unknown = null;
      try {
        persisted = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      } catch {}
      const currentAttempt = manualOrderAttempt(
        attempt.current,
        persisted,
        fingerprint,
        () => crypto.randomUUID(),
      );
      attempt.current = currentAttempt;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(currentAttempt));
      } catch {}
      const common = {
        p_key: currentAttempt.key,
        p_token: currentAttempt.token,
        p_customer: payload.customer,
        p_lines: payload.lines,
        p_locale: payload.locale,
        p_zone: payload.zone,
        p_payment: payload.payment,
        p_paid: payload.paid,
      };
      const result = await storeClient()
        .rpc(isPast ? "create_past_chat_order" : "create_chat_order", {
          ...common,
          ...(history
            ? {
                p_ordered_on: history.orderedOn,
                p_paid_on: history.paidOn,
                p_stock_handling: stockHandling,
                p_expected_total: preview.total,
              }
            : {}),
        })
        .abortSignal(AbortSignal.timeout(25000));
      if (result.error) throw result.error;
      if (
        !result.data ||
        !Number.isSafeInteger(Number(result.data.order_number))
      )
        throw Error("INVALID_RECEIPT");
      setTrackingToken(currentAttempt.token);
      setReceipt(result.data as Receipt);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      try {
        await onSaved();
      } catch {
        setWarning(c.refreshError);
      }
    } catch (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "";
      if (message.includes("TOTAL_MISMATCH")) setConfirmedPriceKey("");
      setError(
        message.includes("INVALID_DATE")
          ? c.datesError
          : message.includes("INVALID_COST")
            ? c.costError
            : message.includes("TOTAL_MISMATCH")
              ? c.totalChanged
              : message.includes("ORIGINAL_CONFIRMATION_REQUIRED")
                ? c.confirmationRequired
                : message.includes("OUT_OF_STOCK")
                  ? c.stockError
                  : message.includes("INVALID_DELIVERY") ||
                      message.includes("INVALID_PAYMENT")
                    ? c.optionsChanged
                    : message.includes("INVALID_ORDER")
                      ? c.validation
                      : /FORBIDDEN|ADMIN_REQUIRED|permission denied|JWT|SIGN_IN/i.test(
                            message,
                          )
                        ? c.forbidden
                        : c.saveError,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const trackingUrl =
    trackingToken && typeof location !== "undefined"
      ? `${location.origin}/order/#order=${trackingToken}`
      : "";
  if (receipt)
    return (
      <section className={panel}>
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-leaf-soft text-brand">
          <CheckCircle2 aria-hidden="true" />
        </span>
        <h2 ref={savedHeading} tabIndex={-1} className="text-2xl">
          {c.saved} · DC-{receipt.order_number}
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          {receipt.is_historical ? c.pastSavedNotice : c.savedNotice}
        </p>
        {receipt.is_historical && (
          <div className="mt-4 space-y-2 text-sm text-ink-muted">
            {receipt.ordered_at && (
              <p>
                {c.orderedOn}:{" "}
                {new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
                  timeZone: "Africa/Cairo",
                  dateStyle: "medium",
                }).format(new Date(receipt.ordered_at))}
              </p>
            )}
            <p>
              {receipt.stock_handling === "deduct_now"
                ? c.deductNow
                : c.accounted}
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-semibold text-brand">
            {storeCopy[locale][receipt.status]}
          </span>
          <span className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-semibold text-brand">
            {receipt.payment_status === "paid"
              ? c.paidStatus
              : receipt.payment_status === "refunded"
                ? storeCopy[locale].refunded
                : c.unpaidStatus}
          </span>
        </div>
        <dl className="mt-5 max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{c.subtotal}</dt>
            <dd>
              {receipt.subtotal} {c.currency}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{c.fee}</dt>
            <dd>
              {receipt.delivery_fee} {c.currency}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3 font-semibold">
            <dt>{c.total}</dt>
            <dd>
              {receipt.total} {c.currency}
            </dd>
          </div>
        </dl>
        <div className="mt-6 max-w-2xl rounded-2xl border border-line p-4">
          <label className="block text-sm font-semibold">
            {c.tracking}
            <input
              ref={trackingInput}
              type="text"
              dir="ltr"
              className={field}
              value={trackingUrl}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            {c.trackingHint}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(trackingUrl);
                setCopyMessage(c.copied);
              } catch {
                trackingInput.current?.focus();
                trackingInput.current?.select();
                setCopyMessage(c.copyFailed);
              }
            }}
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            {c.copyLink}
          </button>
          {copyMessage && (
            <p role="status" className="mt-1 text-sm text-ink-muted">
              {copyMessage}
            </p>
          )}
        </div>
        {warning && (
          <p role="status" className="mt-4 rounded-xl bg-orange/15 p-3 text-sm">
            {warning}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {onViewOrder && (
            <ClayButton onClick={() => onViewOrder(receipt.order_number)}>
              {c.viewOrder}
            </ClayButton>
          )}
          <ClayButton variant="outline" onClick={reset}>
            {c.newOrder}
          </ClayButton>
          {onCancel && (
            <button
              type="button"
              className="min-h-12 rounded-xl px-3 font-semibold text-brand"
              onClick={onCancel}
            >
              {c.done}
            </button>
          )}
        </div>
      </section>
    );
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className={panel}
      aria-busy={busy}
    >
      <h2 className="text-2xl">{c.title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
        {isPast ? c.pastIntro : c.intro}
      </p>
      <fieldset disabled={busy} className="mt-6 space-y-6">
        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-sm font-semibold">{c.mode}</legend>
          <div className="grid grid-cols-1 gap-2 rounded-2xl bg-canvas-sunk p-1.5 sm:grid-cols-2">
            {(
              [
                { value: "new", label: c.newMode },
                { value: "past", label: c.pastMode },
              ] as const
            ).map((item) => (
              <label
                key={item.value}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold ${mode === item.value ? "border-brand/40 bg-surface text-brand shadow-clay-sm" : "border-transparent text-ink-muted"}`}
              >
                <input
                  type="radio"
                  name="manual-order-mode"
                  value={item.value}
                  checked={mode === item.value}
                  className="h-4 w-4 shrink-0 accent-brand"
                  onChange={() => changeMode(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        {isPast && (
          <fieldset className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {c.history}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                {c.orderedOn}
                <input
                  type="date"
                  className={field}
                  required
                  max={today}
                  value={orderedOn}
                  onChange={(event) => setOrderedOn(event.target.value)}
                />
              </label>
              {paid && (
                <label className="text-sm">
                  {c.paidOn}
                  <input
                    type="date"
                    className={field}
                    required
                    min={orderedOn || undefined}
                    max={today}
                    value={paidOn}
                    onChange={(event) => setPaidOn(event.target.value)}
                  />
                </label>
              )}
            </div>
            <p className="text-xs leading-5 text-ink-muted">
              {c.originalDatesHint}
            </p>
            <label className="block text-sm">
              {c.stockHandling}
              <select
                className={field}
                value={stockHandling}
                onChange={(event) =>
                  setStockHandling(
                    event.target.value as "already_accounted" | "deduct_now",
                  )
                }
              >
                <option value="already_accounted">{c.accounted}</option>
                <option value="deduct_now">{c.deductNow}</option>
              </select>
            </label>
            <p className="text-xs leading-5 text-ink-muted">{c.stockHint}</p>
          </fieldset>
        )}
        <fieldset className="space-y-4 border-0 p-0">
          <legend className="mb-3 font-display text-lg font-semibold">
            {c.products}
          </legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 basis-56 flex-1 text-sm">
              {c.chooseProduct}
              <select
                className={field}
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">{c.chooseProduct}</option>
                {productGroups
                  .filter((group) => group.products.length)
                  .map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {group.products
                        .filter(
                          (product) =>
                            !lines.some(
                              (line) => line.id === product.product_id,
                            ),
                        )
                        .map((product) => (
                          <option
                            key={product.product_id}
                            value={product.product_id}
                          >
                            {ar ? product.name_ar : product.name_en} ·{" "}
                            {product.price} {c.currency}
                            {!product.active ? ` · ${c.paused}` : ""}
                          </option>
                        ))}
                    </optgroup>
                  ))}
              </select>
            </label>
            <ClayButton
              type="button"
              variant="outline"
              onClick={addProduct}
              disabled={!productId || busy}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {c.addProduct}
            </ClayButton>
          </div>
          {!activeProducts.length && (
            <p className="text-sm text-ink-muted">
              {isPast ? c.pastNoProducts : c.noProducts}
            </p>
          )}
          {newHasPausedProducts && (
            <p role="status" className="rounded-xl bg-orange/15 p-3 text-sm">
              {c.newPaused}
            </p>
          )}
          {lines.length > 0 && (
            <ul className="space-y-3">
              {lines.map((line) => {
                const product = stock.find((p) => p.product_id === line.id);
                const catalogProduct = PRODUCTS.find((p) => p.id === line.id);
                const category = PRODUCT_CATEGORIES.find(
                  (category) => category.id === catalogProduct?.category,
                );
                if (!product) return null;
                return (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-canvas/40 p-3"
                  >
                    {catalogProduct ? (
                      <img
                        src={catalogProduct.thumb}
                        width={56}
                        height={56}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <Package
                        aria-hidden="true"
                        className="h-12 w-12 shrink-0 text-brand"
                      />
                    )}
                    <div className="min-w-0 flex-1 basis-28">
                      <p className="text-xs text-ink-muted">
                        {category?.name[locale] ?? c.otherProducts}
                      </p>
                      <p className="font-semibold">
                        {ar ? product.name_ar : product.name_en}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {product.price} {c.currency} ·{" "}
                        {product.unlimited_stock
                          ? c.unlimited
                          : `${Math.max(0, product.on_hand - product.reserved)} ${c.available}`}
                      </p>
                    </div>
                    <label className="w-24 text-sm">
                      {c.quantity}
                      <input
                        type="number"
                        className={field}
                        required
                        min={1}
                        max={99}
                        step={1}
                        value={line.qty || ""}
                        aria-label={`${c.quantity} — ${ar ? product.name_ar : product.name_en}`}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, qty: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    {isPast && (
                      <label className="w-full text-sm sm:w-40">
                        {c.originalCost}
                        <input
                          type="number"
                          className={field}
                          min={0}
                          max={9999999999.99}
                          step="0.01"
                          inputMode="decimal"
                          value={line.unitCost ?? ""}
                          aria-label={`${c.originalCost} — ${ar ? product.name_ar : product.name_en}`}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? { ...item, unitCost: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      aria-label={`${c.remove} — ${ar ? product.name_ar : product.name_en}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.id !== line.id),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {isPast && (
            <p className="text-xs leading-5 text-ink-muted">{c.costHint}</p>
          )}
        </fieldset>
        <fieldset className="space-y-3 border-0 border-t border-line pt-5">
          <legend className="font-display text-lg font-semibold">
            {c.customer}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {c.name}
              <input
                className={field}
                type="text"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                value={customer.name}
                onChange={(event) =>
                  setCustomer({ ...customer, name: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              {c.phone}
              <input
                className={field}
                type="tel"
                required
                maxLength={30}
                inputMode="tel"
                dir="ltr"
                autoComplete="off"
                value={customer.phone}
                onChange={(event) =>
                  setCustomer({ ...customer, phone: event.target.value })
                }
              />
            </label>
          </div>
          <label className="block text-sm">
            {c.address}
            <input
              className={field}
              type="text"
              required
              minLength={5}
              maxLength={500}
              autoComplete="off"
              value={customer.address}
              onChange={(event) =>
                setCustomer({ ...customer, address: event.target.value })
              }
            />
          </label>
        </fieldset>
        <fieldset className="space-y-3 border-0 border-t border-line pt-5">
          <legend className="font-display text-lg font-semibold">
            {c.delivery}
          </legend>
          {options === "loading" && (
            <p role="status" className="text-sm text-ink-muted">
              {c.loading}
            </p>
          )}
          {options === "error" && (
            <div role="alert" className="rounded-xl bg-orange/15 p-3 text-sm">
              {c.loadError}{" "}
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 font-semibold text-brand underline"
                onClick={() => void loadOptions()}
              >
                {c.retry}
              </button>
            </div>
          )}
          {options === "ready" && !availableZones.length && (
            <p role="status" className="text-sm text-ink-muted">
              {isPast ? c.pastNoDelivery : c.noDelivery}
            </p>
          )}
          {options === "ready" &&
            !isPast &&
            !methods.cash &&
            !methods.transfer && (
              <p role="status" className="text-sm text-ink-muted">
                {c.noPayment}
              </p>
            )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {c.area}
              <select
                className={field}
                required
                value={zoneId}
                disabled={options !== "ready" || !availableZones.length}
                onChange={(event) => setZoneId(event.target.value)}
              >
                <option value="">{c.chooseArea}</option>
                {availableZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {ar ? zone.name_ar : zone.name_en} · {zone.fee} {c.currency}
                    {!zone.active ? ` · ${c.paused}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {c.payment}
              <select
                className={field}
                required
                value={payment}
                disabled={
                  options !== "ready" ||
                  (!isPast && !methods.cash && !methods.transfer)
                }
                onChange={(event) => setPayment(event.target.value)}
              >
                {(isPast || methods.cash) && (
                  <option value="cash">{c.cash}</option>
                )}
                {(isPast || methods.transfer) && (
                  <option value="transfer">{c.transfer}</option>
                )}
              </select>
            </label>
          </div>
          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-line bg-canvas/40 p-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brand"
              checked={paid}
              onChange={(event) => {
                setPaid(event.target.checked);
                if (!event.target.checked) setPaidOn("");
              }}
            />
            <span>
              <span className="block text-sm font-semibold">{c.paid}</span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">
                {c.paidHint}
              </span>
            </span>
          </label>
        </fieldset>
        <div className="rounded-2xl bg-canvas-sunk p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{c.subtotal}</dt>
              <dd>
                {subtotal} {c.currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{c.fee}</dt>
              <dd>
                {selectedZone ? `${selectedZone.fee} ${c.currency}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line pt-3 text-lg font-semibold">
              <dt>{c.total}</dt>
              <dd>{selectedZone ? `${preview.total} ${c.currency}` : "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            {selectedZone
              ? isPast
                ? c.pastStatus
                : paid
                  ? c.statusPaid
                  : c.status
              : c.selectArea}
          </p>
        </div>
        {isPast && (
          <div className="rounded-2xl border border-line bg-canvas/40 p-4">
            <label className="flex min-h-12 items-start gap-3">
              <input
                type="checkbox"
                required
                className="mt-1 h-5 w-5 shrink-0 accent-brand"
                checked={originalConfirmed}
                onChange={(event) =>
                  setConfirmedPriceKey(
                    event.target.checked ? preview.confirmationKey : "",
                  )
                }
              />
              <span className="text-sm font-semibold">{c.confirmOriginal}</span>
            </label>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {c.originalPriceHint}
            </p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {error === c.totalChanged && (
          <button
            type="button"
            disabled={busy || options === "loading"}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-brand underline"
            onClick={async () => {
              setConfirmedPriceKey("");
              await Promise.all([
                loadOptions(),
                onSaved().catch(() => setWarning(c.loadError)),
              ]);
            }}
          >
            {c.reloadPrices}
          </button>
        )}
        <div className="flex flex-wrap gap-3">
          <ClayButton
            type="submit"
            disabled={
              busy ||
              !configured ||
              !activeProducts.length ||
              newHasPausedProducts
            }
          >
            {busy ? c.saving : c.save}
          </ClayButton>
          {onCancel && (
            <ClayButton
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onCancel}
            >
              {c.cancel}
            </ClayButton>
          )}
        </div>
      </fieldset>
    </form>
  );
}
