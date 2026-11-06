"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeClient } from "@/lib/store/client";
import { PRODUCTS } from "@/lib/products";
import { cairoDay } from "@/lib/store/manual-order-history";
import {
  activeUnits,
  adjustmentAttempt,
  remainingUnits,
  returnableUnits,
  type OrderAdjustmentDetail,
  type AdjustmentItem,
} from "@/lib/store/order-adjustments";

type Zone = {
  id: string;
  name_en: string;
  name_ar: string;
  fee: number;
  active: boolean;
};
type Product = {
  product_id: string;
  name_en: string;
  name_ar: string;
  price: number;
  active: boolean;
};
type Section =
  | "details"
  | "items"
  | "shipping"
  | "payments"
  | "returns"
  | "history"
  | "recovery";
const field = "store-field mt-1";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-40";
const primary = button + " bg-brand text-canvas hover:bg-brand/90";
const formClass = "space-y-3";
const panel = "space-y-3 rounded-xl border border-line bg-surface p-4";
const text = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? "").trim();
const number = (form: HTMLFormElement, name: string) =>
  Number(text(form, name));
function Label({ children, title }: { children: ReactNode; title: string }) {
  return (
    <label className="block min-w-0 text-sm">
      {title}
      {children}
    </label>
  );
}
export function OrderAdjustments({
  orderId,
  onSaved,
  onBusyChange,
}: {
  orderId: string;
  onSaved: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { locale } = useLocale(),
    ar = locale === "ar";
  const { session, ready, isAdmin, roleReady } = useCustomerAuth();
  const owner = `${session?.user.id ?? "guest"}:${orderId}`;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [detail, setDetail] = useState<OrderAdjustmentDetail | null>(null),
    [zones, setZones] = useState<Zone[]>([]),
    [products, setProducts] = useState<Product[]>([]);
  const [section, setSection] = useState<Section>("details"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [generation, setGeneration] = useState(0);
  const read = useRef<AbortController | null>(null),
    write = useRef<AbortController | null>(null),
    alive = useRef(true),
    inFlight = useRef(false);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error) return;
    errorElement.current?.focus({ preventScroll: true });
    errorElement.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const attempts = useRef(
    new Map<string, { body: string; key: string; revision: number }>(),
  );
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const snapshot = useRef<OrderAdjustmentDetail | null>(null);
  snapshot.current = detail;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const money = (v: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(Number(v || 0));
  const date = (v?: string | null) =>
    v
      ? new Date(v).toLocaleString(ar ? "ar-EG" : "en-GB", {
          timeZone: "Africa/Cairo",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const load = useCallback(async () => {
    if (!ready || !roleReady || !isAdmin || !session) return false;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    const identity = owner;
    setLoading(true);
    const current = () =>
      alive.current &&
      ownerRef.current === identity &&
      read.current === controller;
    try {
      const db = storeClient();
      const [record, delivery, catalog] = await Promise.all([
        db
          .rpc("admin_order_detail", { p_id: orderId })
          .abortSignal(controller.signal),
        db
          .from("delivery_zones")
          .select("id,name_en,name_ar,fee,active")
          .order("name_en")
          .abortSignal(controller.signal),
        db
          .from("inventory")
          .select("product_id,name_en,name_ar,price,active")
          .order("name_en")
          .abortSignal(controller.signal),
      ]);
      if (!current()) return false;
      if (
        record.error ||
        delivery.error ||
        catalog.error ||
        !record.data?.order
      )
        throw Error();
      setDetail(record.data as OrderAdjustmentDetail);
      setZones(delivery.data ?? []);
      setProducts(catalog.data ?? []);
      return true;
    } catch {
      if (current())
        setError(
          ar
            ? "تعذر تحميل تفاصيل التعديلات. أعد المحاولة."
            : "Could not load order adjustments. Try again.",
        );
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }, [ready, roleReady, isAdmin, session?.user.id, orderId, owner, ar]);
  useEffect(() => {
    alive.current = true;
    setDetail(null);
    setLocked(false);
    setError("");
    attempts.current.clear();
    void load();
    return () => {
      alive.current = false;
      read.current?.abort();
      write.current?.abort();
      inFlight.current = false;
      busyCallback.current?.(false);
    };
  }, [owner, ready, roleReady, isAdmin]);
  async function reload() {
    setError("");
    if (await load()) {
      setLocked(false);
      setGeneration((v) => v + 1);
    }
  }
  async function mutate(
    action: string,
    payload: Record<string, unknown>,
    reason: string,
  ): Promise<boolean> {
    const currentOrder = snapshot.current;
    if (inFlight.current || locked || !currentOrder || !isAdmin) return false;
    if (action !== "note" && reason.trim().length < 3) {
      setError(
        t(
          "Enter a short reason for this adjustment.",
          "اكتب سببًا مختصرًا لهذا التعديل.",
        ),
      );
      return false;
    }
    if (
      (action === "ship" || action === "return") &&
      !(payload.lines as unknown[])?.length
    ) {
      setError(
        t(
          "Select at least one product quantity.",
          "حدّد كمية منتج واحد على الأقل.",
        ),
      );
      return false;
    }
    if (action === "note") reason = t("Internal note", "ملاحظة داخلية");
    if (
      action === "items" &&
      !(payload.lines as unknown[])?.length &&
      !(payload.additions as unknown[])?.length
    ) {
      setError(
        t(
          "Change an unshipped quantity or add a catalog product.",
          "غيّر كمية غير مشحونة أو أضف منتجًا من الكتالوج.",
        ),
      );
      return false;
    }
    const body = JSON.stringify({ action, payload, reason: reason.trim() });
    const attempt = adjustmentAttempt(
      attempts.current.get(body),
      body,
      Number(currentOrder.order.revision),
      () => crypto.randomUUID(),
    );
    attempts.current.set(body, attempt);
    const controller = new AbortController();
    write.current = controller;
    const identity = owner;
    inFlight.current = true;
    setBusy(true);
    busyCallback.current?.(true);
    setError("");
    setMessage("");
    const timer = setTimeout(() => controller.abort(), 25000);
    const current = () =>
      alive.current &&
      ownerRef.current === identity &&
      write.current === controller;
    try {
      const result = await storeClient()
        .rpc("admin_order_action", {
          p_id: orderId,
          p_revision: attempt.revision,
          p_key: attempt.key,
          p_action: action,
          p_payload: payload,
          p_reason: reason.trim(),
        })
        .abortSignal(controller.signal);
      if (!current()) return false;
      if (result.error) throw result.error;
      attempts.current.delete(body);
      const refreshed = await load();
      if (!current()) return false;
      setLocked(!refreshed);
      setMessage(
        refreshed
          ? t("Adjustment saved.", "تم حفظ التعديل.")
          : t(
              "Saved. Reload the latest order before making another adjustment.",
              "تم الحفظ. حمّل آخر نسخة قبل إجراء تعديل آخر.",
            ),
      );
      try {
        await onSaved();
      } catch {
        if (current())
          setMessage(
            t(
              "Saved. Refresh the order list to update its summary.",
              "تم الحفظ. حدّث قائمة الطلبات لتحديث الملخص.",
            ),
          );
      }
      return true;
    } catch (e) {
      if (current()) {
        const code = String((e as { message?: string })?.message ?? "");
        if (code.includes("ORDER_CHANGED")) {
          // The server definitively rejected this revision before writing. A
          // deliberate reload may retry the same intended edit on the new one.
          attempts.current.delete(body);
          setLocked(true);
          setError(
            t(
              "This order changed. Reload the latest order before adjusting it again. Reloading clears unsaved form entries.",
              "تغيّر هذا الطلب. حمّل النسخة الأخيرة قبل تعديله. إعادة التحميل تستبدل المدخلات غير المحفوظة.",
            ),
          );
        } else if (code.includes("OUT_OF_STOCK"))
          setError(
            t(
              "There is not enough available stock. The order was not changed.",
              "المخزون المتاح غير كافٍ. لم يتغير الطلب.",
            ),
          );
        else if (code.includes("FORBIDDEN")) {
          setLocked(true);
          setError(
            t(
              "Admin access is required. Reload to check your access.",
              "يلزم وصول إداري. أعد التحميل للتحقق من صلاحياتك.",
            ),
          );
        } else if (code.includes("DELIVERY_CHANGE_CONFIRMATION_REQUIRED"))
          setError(
            t(
              "Confirm that you coordinated this address or zone change with the customer and courier before saving.",
              "أكد تنسيق تغيير العنوان أو المنطقة مع العميل وشركة الشحن قبل الحفظ.",
            ),
          );
        else if (code.includes("DISPATCH_DATE_IMMUTABLE"))
          setError(
            t(
              "Recorded dispatch dates are locked. Use the controlled undo only for a recording mistake before goods left the store.",
              "تاريخ الشحن المسجل مقفل. استخدم التراجع المنضبط فقط لخطأ تسجيل قبل خروج المنتجات من المتجر.",
            ),
          );
        else if (code.includes("DELIVERY_WAIVER_REQUIRES_FULL_RETURN"))
          setError(
            t(
              "Delivery can be waived only when no products remain chargeable on the returned order.",
              "يمكن إلغاء رسوم التوصيل فقط عندما لا تبقى منتجات مستحقة الدفع في الطلب المرتجع.",
            ),
          );
        else if (
          code.includes("REOPEN_REQUIRED") ||
          code.includes("REOPEN_BEFORE_PAYMENT")
        )
          setError(
            t(
              "Reopen this cancelled or expired order before making this adjustment.",
              "أعد فتح الطلب الملغي أو المنتهي قبل هذا التعديل.",
            ),
          );
        else if (code.includes("REFUND_EXCEEDS_RECEIPTS"))
          setError(
            t(
              "A refund cannot exceed the money already received. Check the payment history.",
              "لا يمكن رد مبلغ أكبر من المقبوض بالفعل. راجع سجل الدفع.",
            ),
          );
        else if (code.includes("USE_RETURN_FLOW"))
          setError(
            t(
              "Use Returns for products already dispatched or returned.",
              "استخدم المرتجعات للمنتجات التي شُحنت أو عادت بالفعل.",
            ),
          );
        else if (
          code.includes("INVALID") ||
          code.includes("RETURN_BEFORE_SHIPMENT") ||
          code.includes("DELIVERY_AFTER_RETURN") ||
          code.includes("NO_ITEMS_TO_DELIVER") ||
          code.includes("NOT_ALLOWED") ||
          code.includes("UNAVAILABLE")
        )
          setError(
            t(
              "This adjustment is not available for the current order or its values. Check quantities, dates and amounts, then reload if needed.",
              "هذا التعديل غير متاح لحالة الطلب أو قيمه الحالية. راجع الكميات والتواريخ والمبالغ وأعد التحميل عند الحاجة.",
            ),
          );
        else {
          setLocked(true);
          setError(
            t(
              "The result could not be confirmed. Reload the latest order before retrying; identical attempts keep their retry key.",
              "تعذر تأكيد النتيجة. حمّل آخر نسخة قبل المحاولة؛ تحتفظ المحاولة المطابقة بمفتاحها لمنع التكرار.",
            ),
          );
        }
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (current()) {
        write.current = null;
        inFlight.current = false;
        setBusy(false);
        busyCallback.current?.(false);
      }
    }
  }
  function submit(
    action: string,
    build: (form: HTMLFormElement) => Record<string, unknown>,
    reset = true,
  ) {
    return async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const ok = await mutate(action, build(form), text(form, "reason"));
      if (ok && reset && form.isConnected) form.reset();
    };
  }
  const reason = (label = t("Reason", "السبب")) => (
    <Label title={label}>
      <input
        className={field}
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
    </Label>
  );
  const sections: { id: Section; en: string; ar: string }[] = [
    { id: "details", en: "Customer & delivery", ar: "العميل والتوصيل" },
    { id: "items", en: "Items & replacements", ar: "المنتجات والبدائل" },
    { id: "shipping", en: "Shipments", ar: "الشحنات" },
    { id: "payments", en: "Payments", ar: "الدفع" },
    { id: "returns", en: "Returns", ar: "المرتجعات" },
    { id: "history", en: "History & notes", ar: "السجل والملاحظات" },
    { id: "recovery", en: "Corrections", ar: "التصحيحات" },
  ];
  if (!detail)
    return (
      <section className={panel} aria-busy={loading}>
        <p role={error ? "alert" : "status"}>
          {error ||
            t("Loading order adjustments…", "جارٍ تحميل تعديلات الطلب…")}
        </p>
        <button
          className={button}
          disabled={loading}
          onClick={() => void reload()}
        >
          {t("Reload adjustments", "إعادة تحميل التعديلات")}
        </button>
      </section>
    );
  const o = detail.order,
    finance = detail.finance;
  const disabled = busy || loading || locked;
  const catalogName = (id: string, fallback: string) => {
    const product = PRODUCTS.find((product) => product.id === id);
    return product?.variantLabel
      ? `${fallback} — ${product.variantLabel[locale]}`
      : fallback;
  };
  const name = (i: AdjustmentItem) =>
    catalogName(i.product_id, ar ? i.name_ar : i.name_en);
  const actionLabel = (kind?: string) =>
    ({
      details: t("Customer / delivery edited", "تعديل العميل / التوصيل"),
      items: t("Items adjusted", "تعديل المنتجات"),
      ship: t("Shipment recorded", "تسجيل شحنة"),
      deliver: t("Delivery recorded", "تسجيل التسليم"),
      return: t("Return recorded", "تسجيل مرتجع"),
      waive_delivery: t("Delivery fee waived", "إلغاء رسوم التوصيل"),
      payment: t("Payment received", "استلام مبلغ"),
      refund: t("Refund recorded", "تسجيل رد مبلغ"),
      payment_date: t("Payment date corrected", "تصحيح تاريخ الدفع"),
      order_date: t("Order date corrected", "تصحيح تاريخ الطلب"),
      shipment_details: t("Shipment details corrected", "تصحيح بيانات الشحنة"),
      note: t("Internal note", "ملاحظة داخلية"),
      reopen: t("Order reopened", "إعادة فتح الطلب"),
      extend: t("Reservation extended", "تمديد الحجز"),
      confirm: t("Order confirmed", "تأكيد الطلب"),
      cancel: t("Outstanding items cancelled", "إلغاء المنتجات المتبقية"),
      undo_shipment: t("Mistaken shipment reversed", "التراجع عن شحنة خاطئة"),
    })[kind ?? ""] ?? t("Order update", "تحديث الطلب");
  const itemPicker = (mode: "ship" | "return" | "edit") => (
    <div className="space-y-2">
      {detail.items.map((i) => {
        const available =
          mode === "ship"
            ? remainingUnits(i)
            : mode === "return"
              ? returnableUnits(i)
              : activeUnits(i);
        const picture = PRODUCTS.find((p) => p.id === i.product_id);
        return (
          <div
            key={i.id}
            className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-line p-3"
          >
            {picture && (
              <img
                src={picture.thumb}
                alt=""
                className="h-10 w-10 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{name(i)}</p>
              <p className="text-xs text-ink-muted">
                {t("Ordered", "المطلوب")}: {activeUnits(i)} ·{" "}
                {t("Shipped", "المشحون")}: {i.shipped_quantity || 0} ·{" "}
                {t("Held", "المحجوز")}: {i.reserved_quantity || 0} ·{" "}
                {t("Returned", "المرتجع")}: {i.returned_quantity || 0}
              </p>
            </div>
            <Label
              title={
                mode === "edit"
                  ? t("Keep on order", "الكمية في الطلب")
                  : mode === "ship"
                    ? t("Ship now", "اشحن الآن")
                    : t("Return now", "أرجع الآن")
              }
            >
              <input
                className={field + " !w-24"}
                type="number"
                name={`qty:${i.id}`}
                min={mode === "edit" ? Number(i.shipped_quantity || 0) : 0}
                max={available}
                step={1}
                defaultValue={mode === "edit" ? activeUnits(i) : 0}
                disabled={mode !== "edit" && available === 0}
                aria-label={`${mode === "edit" ? t("Order quantity", "كمية الطلب") : mode === "ship" ? t("Shipment quantity", "كمية الشحنة") : t("Return quantity", "كمية المرتجع")} — ${name(i)}`}
              />
            </Label>
            {mode === "return" && available > 0 && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`restock:${i.id}`}
                  className="h-5 w-5 accent-brand"
                />
                {t("Return to stock", "إعادة للمخزون")}
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
  function timelineSummary(event: OrderAdjustmentDetail["timeline"][number]) {
    const request = event.payload?.request as
      Record<string, unknown> | undefined;
    if (!request) return [];
    const result: string[] = [];
    if (typeof request.amount === "number")
      result.push(`${t("Amount", "المبلغ")}: ${money(request.amount)}`);
    if (typeof request.reference === "string" && request.reference)
      result.push(`${t("Reference", "المرجع")}: ${request.reference}`);
    for (const key of [
      "date",
      "ordered_on",
      "dispatched_on",
      "delivered_on",
      "returned_on",
      "expires_at",
    ])
      if (typeof request[key] === "string") result.push(String(request[key]));
    if (Array.isArray(request.lines))
      for (const line of request.lines as {
        item_id: number;
        quantity: number;
        restock?: boolean;
      }[]) {
        const item = detail!.items.find(
          (item) => item.id === Number(line.item_id),
        );
        result.push(
          `${item ? name(item) : t("Product", "منتج")} × ${line.quantity}${line.restock === undefined ? "" : line.restock ? ` · ${t("Restocked", "أُعيد للمخزون")}` : ` · ${t("Not restocked", "لم يُعد للمخزون")}`}`,
        );
      }
    if (Array.isArray(request.additions))
      for (const addition of request.additions as {
        product_id: string;
        quantity: number;
      }[]) {
        const product = products.find(
          (product) => product.product_id === addition.product_id,
        );
        result.push(
          `${t("Added", "إضافة")}: ${product ? (ar ? product.name_ar : product.name_en) : addition.product_id} × ${addition.quantity}`,
        );
      }
    const before = event.payload?.before as Record<string, unknown> | undefined,
      after = event.payload?.after as Record<string, unknown> | undefined;
    for (const [key, label] of [
      ["customer_name", t("Customer", "العميل")],
      ["customer_phone", t("Phone", "الهاتف")],
      ["customer_address", t("Address", "العنوان")],
      ["delivery_zone", t("Zone", "المنطقة")],
    ] as const)
      if (before && after && before[key] !== after[key])
        result.push(
          `${label}: ${String(before[key] ?? "—")} → ${String(after[key] ?? "—")}`,
        );
    return result;
  }
  const lines = (form: HTMLFormElement, mode: "ship" | "return" | "edit") =>
    detail.items
      .map((i) => ({
        item_id: i.id,
        quantity: number(form, `qty:${i.id}`),
        ...(mode === "return"
          ? { restock: new FormData(form).has(`restock:${i.id}`) }
          : {}),
      }))
      .filter((i, index) =>
        mode === "edit"
          ? i.quantity !== activeUnits(detail.items[index])
          : i.quantity > 0,
      );
  return (
    <section
      className="space-y-4"
      aria-label={t("Order adjustments", "تعديلات الطلب")}
      aria-busy={busy || loading}
    >
      <p className="text-xs text-ink-muted">
        {o.ops_managed
          ? t(
              "Product costs follow shipped quantities, less explicitly restocked returns.",
              "تُحسب تكلفة الكميات المشحونة بعد خصم المرتجعات المعادة للمخزون صراحةً.",
            )
          : t(
              "This order uses the earlier paid-order cost estimate. Its first adjustment switches to shipped quantities with a recorded cost adjustment; no cash movement is created.",
              "يستخدم هذا الطلب تقدير التكلفة السابق عند الدفع. أول تعديل ينقله إلى تكلفة الكميات المشحونة مع تسجيل تصحيح التكلفة، دون إنشاء حركة نقدية.",
            )}
      </p>
      {!o.ops_managed && ["shipped", "delivered"].includes(o.status) && (
        <div className="space-y-2 rounded-xl bg-canvas-sunk p-3 text-sm">
          <p>
            {t(
              "This earlier order has no detailed shipment record yet. Prepare its existing shipment before correcting tracking details.",
              "لا يحتوي هذا الطلب السابق على سجل شحنة مفصل بعد. جهّز شحنته المسجلة قبل تصحيح بيانات التتبع.",
            )}
          </p>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() =>
              void mutate(
                "manage",
                {},
                t(
                  "Prepare existing shipment for adjustments",
                  "تجهيز الشحنة السابقة للتعديل",
                ),
              )
            }
          >
            {t("Prepare existing shipment", "تجهيز الشحنة السابقة")}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas-sunk p-3 text-sm">
        <div>
          <span className="block text-xs text-ink-muted">
            {t("Order total", "إجمالي الطلب")}
          </span>
          <strong>{money(Number(o.subtotal) + Number(o.delivery_fee))}</strong>
        </div>
        <div>
          <span className="block text-xs text-ink-muted">
            {t("Net received", "صافي المقبوض")}
          </span>
          <strong>
            {finance?.net_collected == null
              ? "—"
              : money(finance.net_collected)}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-ink-muted">
            {t("Amount due", "المتبقي للدفع")}
          </span>
          <strong>
            {finance?.balance_due == null ? "—" : money(finance.balance_due)}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-ink-muted">
            {t("Refund due", "المطلوب رده")}
          </span>
          <strong>
            {finance?.refund_due == null ? "—" : money(finance.refund_due)}
          </strong>
        </div>
      </div>
      <nav
        className="flex gap-1 overflow-x-auto pb-1"
        aria-label={t("Adjustment sections", "أقسام التعديل")}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
            className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-brand/35 ${section === s.id ? "bg-brand text-canvas" : "border border-line text-brand"}`}
          >
            {ar ? s.ar : s.en}
          </button>
        ))}
      </nav>
      {error && (
        <p
          ref={errorElement}
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-orange/20 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-leaf-soft p-3 text-sm">
          {message}
        </p>
      )}
      <button
        type="button"
        className={button}
        disabled={busy || loading}
        onClick={() => void reload()}
      >
        {t(
          "Reload latest order (clears unsaved entries)",
          "تحميل آخر نسخة (يستبدل المدخلات غير المحفوظة)",
        )}
      </button>
      <div key={generation}>
        <div hidden={section !== "details"} className={panel}>
          <h3 className="font-semibold">
            {t("Customer & delivery", "العميل والتوصيل")}
          </h3>
          <form
            className={formClass}
            onSubmit={submit(
              "details",
              (form) => ({
                name: text(form, "name"),
                phone: text(form, "phone"),
                address: text(form, "address"),
                locale: text(form, "locale"),
                zone_id: text(form, "zone_id"),
                delivery_change_confirmed:
                  new FormData(form).get("delivery_change_confirmed") === "on",
              }),
              false,
            )}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label title={t("Customer name", "اسم العميل")}>
                  <input
                    className={field}
                    name="name"
                    defaultValue={o.customer_name}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </Label>
                <Label title={t("Phone", "الهاتف")}>
                  <input
                    className={field}
                    name="phone"
                    defaultValue={o.customer_phone}
                    required
                    maxLength={30}
                    dir="ltr"
                  />
                </Label>
              </div>
              <Label title={t("Delivery address", "عنوان التوصيل")}>
                <textarea
                  className={field}
                  name="address"
                  defaultValue={o.customer_address}
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                />
              </Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label title={t("Delivery zone", "منطقة التوصيل")}>
                  <select
                    className={field}
                    name="zone_id"
                    defaultValue={o.delivery_zone_id ?? ""}
                  >
                    <option value="">
                      {o.delivery_zone
                        ? t(
                            `Keep current zone (${o.delivery_zone})`,
                            `الإبقاء على المنطقة الحالية (${o.delivery_zone})`,
                          )
                        : t("Choose a zone", "اختر المنطقة")}
                    </option>
                    {zones
                      .filter((z) => z.active || z.id === o.delivery_zone_id)
                      .map((z) => (
                        <option key={z.id} value={z.id}>
                          {ar ? z.name_ar : z.name_en} · {money(z.fee)}
                        </option>
                      ))}
                  </select>
                </Label>
                <Label title={t("Customer language", "لغة العميل")}>
                  <select
                    className={field}
                    name="locale"
                    defaultValue={o.locale}
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </Label>
              </div>
              {reason()}
              {detail.items.some((item) => item.shipped_quantity > 0) && (
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="delivery_change_confirmed"
                    className="mt-1 h-5 w-5 accent-brand"
                  />
                  {t(
                    "I have coordinated any address/zone change with the customer and courier. A changed zone uses its configured fee.",
                    "نسّقت أي تغيير في العنوان أو المنطقة مع العميل وشركة الشحن. تغيير المنطقة يستخدم رسومها المحددة.",
                  )}
                </label>
              )}
              <button className={primary} type="submit">
                {t("Save customer & delivery", "حفظ العميل والتوصيل")}
              </button>
            </fieldset>
          </form>
        </div>
        <div hidden={section !== "items"} className={panel}>
          <h3 className="font-semibold">
            {t("Items & agreed replacements", "المنتجات والبدائل المتفق عليها")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Reduce an unshipped quantity to remove unavailable items. Record an agreed replacement by reducing the original line and adding the replacement at its catalog price. Money differences remain due or refundable.",
              "قلّل كمية غير مشحونة لإزالة منتج غير متاح. لتسجيل بديل متفق عليه، قلّل المنتج الأصلي وأضف البديل بسعر الكتالوج. يظهر الفرق كمبلغ مستحق أو مطلوب رده.",
            )}
          </p>
          <form
            className={formClass}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              if (
                await mutate(
                  "items",
                  {
                    lines: lines(form, "edit"),
                    additions: text(form, "product")
                      ? [
                          {
                            product_id: text(form, "product"),
                            quantity: number(form, "add_qty"),
                          },
                        ]
                      : [],
                  },
                  text(form, "reason"),
                )
              ) {
                const product = form.elements.namedItem(
                  "product",
                ) as HTMLSelectElement | null;
                if (product) product.value = "";
              }
            }}
          >
            <fieldset disabled={disabled} className="space-y-3">
              {itemPicker("edit")}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
                <Label
                  title={t("Add catalog product", "إضافة منتج من الكتالوج")}
                >
                  <select className={field} name="product" defaultValue="">
                    <option value="">{t("No addition", "دون إضافة")}</option>
                    {products
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {catalogName(
                            p.product_id,
                            ar ? p.name_ar : p.name_en,
                          )}{" "}
                          · {money(p.price)}
                        </option>
                      ))}
                  </select>
                </Label>
                <Label title={t("Quantity", "الكمية")}>
                  <input
                    className={field}
                    name="add_qty"
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    defaultValue={1}
                  />
                </Label>
              </div>
              {reason()}
              <button type="submit" className={primary}>
                {t("Save item adjustment", "حفظ تعديل المنتجات")}
              </button>
            </fieldset>
          </form>
        </div>
        <div hidden={section !== "shipping"} className={panel}>
          <h3 className="font-semibold">{t("Shipments", "الشحنات")}</h3>
          <p className="text-xs text-ink-muted">
            {t(
              "After each shipment, all remaining reservations are released. Unshipped items stay on the order; a later shipment checks stock again.",
              "بعد كل شحنة يُحرر باقي الحجز. تبقى المنتجات غير المشحونة في الطلب، وتُراجع الكمية المتاحة عند شحنها لاحقًا.",
            )}
          </p>
          <form
            className={formClass}
            onSubmit={submit("ship", (form) => ({
              lines: lines(form, "ship"),
              courier: text(form, "courier"),
              tracking_number: text(form, "tracking"),
              dispatched_on: text(form, "dispatched"),
              expected_on: text(form, "expected") || null,
            }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              {itemPicker("ship")}
              <div className="grid gap-3 sm:grid-cols-2">
                <Label title={t("Courier", "شركة الشحن")}>
                  <input className={field} name="courier" maxLength={120} />
                </Label>
                <Label
                  title={t("Tracking/reference number", "رقم التتبع أو المرجع")}
                >
                  <input
                    className={field}
                    name="tracking"
                    maxLength={200}
                    dir="ltr"
                  />
                </Label>
                <Label title={t("Dispatch date", "تاريخ الشحن")}>
                  <input
                    className={field}
                    type="date"
                    name="dispatched"
                    defaultValue={cairoDay()}
                    max={cairoDay()}
                    required
                  />
                </Label>
                <Label
                  title={t("Expected delivery date", "موعد التسليم المتوقع")}
                >
                  <input className={field} type="date" name="expected" />
                </Label>
              </div>
              {reason()}
              <button className={primary} type="submit">
                {t("Record selected shipment", "تسجيل شحنة المنتجات المحددة")}
              </button>
            </fieldset>
          </form>
          <ul className="divide-y divide-line">
            {detail.shipments.map((s) => (
              <li key={s.id} className="space-y-2 py-3 text-sm">
                <p className="font-semibold">
                  {s.courier || t("Shipment", "شحنة")} ·{" "}
                  <bdi>{s.tracking_number || s.id.slice(0, 8)}</bdi>
                </p>
                <p className="text-xs text-ink-muted">
                  {t("Dispatched", "الشحن")}:{" "}
                  {s.dispatched_on ||
                    t("Unknown original date", "التاريخ الأصلي غير معروف")}{" "}
                  · {t("Expected", "المتوقع")}: {s.expected_on || "—"}
                  {s.voided_at
                    ? ` · ${t("Undone", "تم التراجع")}`
                    : s.delivered_on
                      ? ` · ${t("Delivered", "تم التسليم")}: ${s.delivered_on}`
                      : s.legacy_delivered
                        ? ` · ${t("Delivered · original date unknown", "تم التسليم · التاريخ الأصلي غير معروف")}`
                        : ""}
                </p>
                {!s.voided_at && (
                  <details className="rounded-xl border border-line p-3">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      {t(
                        "Edit tracking & shipment dates",
                        "تعديل التتبع وتواريخ الشحنة",
                      )}
                    </summary>
                    <form
                      className="space-y-3 pt-2"
                      onSubmit={submit(
                        "shipment_details",
                        (form) => ({
                          shipment_id: s.id,
                          courier: text(form, "courier"),
                          tracking_number: text(form, "tracking"),
                          dispatched_on: text(form, "dispatched") || null,
                          expected_on: text(form, "expected") || null,
                          delivered_on: text(form, "delivered") || null,
                        }),
                        false,
                      )}
                    >
                      <fieldset disabled={disabled} className="space-y-3">
                        <Label title={t("Courier", "شركة الشحن")}>
                          <input
                            className={field}
                            name="courier"
                            defaultValue={s.courier ?? ""}
                            maxLength={120}
                          />
                        </Label>
                        <Label
                          title={t(
                            "Tracking/reference number",
                            "رقم التتبع أو المرجع",
                          )}
                        >
                          <input
                            className={field}
                            name="tracking"
                            defaultValue={s.tracking_number ?? ""}
                            maxLength={200}
                          />
                        </Label>
                        <Label
                          title={t(
                            "Original dispatch date (Cairo)",
                            "تاريخ الشحن الأصلي (القاهرة)",
                          )}
                        >
                          <input
                            className={field}
                            name="dispatched"
                            type="date"
                            defaultValue={s.dispatched_on ?? ""}
                            readOnly={!!s.dispatched_on}
                            max={cairoDay()}
                          />
                        </Label>
                        <Label
                          title={t(
                            "Expected delivery date",
                            "موعد التسليم المتوقع",
                          )}
                        >
                          <input
                            className={field}
                            name="expected"
                            type="date"
                            defaultValue={s.expected_on ?? ""}
                          />
                        </Label>
                        <Label
                          title={t(
                            "Original delivered date, if delivered",
                            "تاريخ التسليم الأصلي إن تم التسليم",
                          )}
                        >
                          <input
                            className={field}
                            name="delivered"
                            type="date"
                            defaultValue={s.delivered_on ?? ""}
                            disabled={!s.delivered_on && !s.legacy_delivered}
                            max={cairoDay()}
                          />
                        </Label>
                        {reason()}
                        <button className={button}>
                          {t("Save shipment details", "حفظ بيانات الشحنة")}
                        </button>
                      </fieldset>
                    </form>
                  </details>
                )}
                {!s.voided_at &&
                  !s.delivered_on &&
                  !s.legacy_delivered &&
                  (s.lines?.some(
                    (line) =>
                      line.quantity > Number(line.returned_quantity ?? 0),
                  ) ??
                    true) && (
                    <form
                      className="space-y-2"
                      onSubmit={submit("deliver", (form) => ({
                        shipment_id: s.id,
                        delivered_on: text(form, "delivered_on"),
                      }))}
                    >
                      <fieldset disabled={disabled} className="space-y-2">
                        <Label
                          title={t(
                            "Actual delivery date",
                            "تاريخ التسليم الفعلي",
                          )}
                        >
                          <input
                            className={field}
                            type="date"
                            name="delivered_on"
                            defaultValue={cairoDay()}
                            max={cairoDay()}
                            required
                          />
                        </Label>
                        {reason()}
                        <button className={button}>
                          {t(
                            "Mark this shipment delivered",
                            "تسجيل تسليم هذه الشحنة",
                          )}
                        </button>
                      </fieldset>
                    </form>
                  )}
              </li>
            ))}
          </ul>
        </div>
        <div hidden={section !== "payments"} className={panel}>
          <h3 className="font-semibold">
            {t(
              "Record money actually received or returned",
              "تسجيل المبالغ المقبوضة أو المرتجعة فعليًا",
            )}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "These entries track money; they do not charge a card or transfer funds. Item changes never create an automatic payment or refund.",
              "هذه قيود متابعة مالية، وليست خصمًا أو تحويلًا فعليًا. تعديل المنتجات لا ينشئ دفعًا أو ردًا تلقائيًا.",
            )}
          </p>
          <form
            className={formClass}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const action = text(form, "kind");
              if (
                await mutate(
                  action,
                  {
                    amount: number(form, "amount"),
                    date: text(form, "date"),
                    reference: text(form, "reference"),
                  },
                  text(form, "reason"),
                )
              )
                form.reset();
            }}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label title={t("Entry type", "نوع القيد")}>
                  <select className={field} name="kind" defaultValue="payment">
                    <option value="payment">
                      {t("Payment received", "مبلغ مستلم")}
                    </option>
                    <option value="refund">
                      {t("Refund sent", "مبلغ تم رده")}
                    </option>
                  </select>
                </Label>
                <Label title={t("Amount (EGP)", "المبلغ (جنيه)")}>
                  <input
                    className={field}
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max="9999999999.99"
                    required
                    inputMode="decimal"
                  />
                </Label>
                <Label
                  title={t(
                    "Original payment/refund date",
                    "تاريخ الدفع أو الرد الأصلي",
                  )}
                >
                  <input
                    className={field}
                    type="date"
                    name="date"
                    defaultValue={cairoDay()}
                    max={cairoDay()}
                    required
                  />
                </Label>
                <Label title={t("Payment reference", "مرجع الدفع")}>
                  <input className={field} name="reference" maxLength={200} />
                </Label>
              </div>
              {reason()}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  className="h-5 w-5 accent-brand"
                />
                {t(
                  "I have verified the actual receipt or refund.",
                  "تحققت من استلام المبلغ أو رده فعليًا.",
                )}
              </label>
              <button className={primary}>
                {t("Record payment entry", "تسجيل القيد المالي")}
              </button>
            </fieldset>
          </form>
          <ul className="divide-y divide-line">
            {finance?.payments?.map((p) => (
              <li key={p.id} className="space-y-1 py-2 text-sm">
                <p className="flex justify-between gap-3">
                  <span>{actionLabel(p.event_type)}</span>
                  <strong>{money(p.amount)}</strong>
                </p>
                <p className="text-xs text-ink-muted">
                  {date(p.occurred_at)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div hidden={section !== "returns"} className={panel}>
          <h3 className="font-semibold">
            {t("Returned products & exchanges", "المنتجات المرتجعة والاستبدال")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Record products actually returned. Check Return to stock only for sellable pieces physically received. Refunds are recorded separately. For an agreed exchange, add its replacement from Items after recording the return.",
              "سجّل المنتجات التي عادت فعليًا. اختر إعادة للمخزون فقط للقطع الصالحة للبيع التي استلمتها. سجّل رد المال منفصلًا. للاستبدال المتفق عليه أضف البديل من المنتجات بعد تسجيل المرتجع.",
            )}
          </p>
          <form
            className={formClass}
            onSubmit={submit("return", (form) => ({
              lines: lines(form, "return"),
              returned_on: text(form, "returned_on"),
              waive_delivery: new FormData(form).get("waive_delivery") === "on",
            }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              {itemPicker("return")}
              <Label title={t("Return received date", "تاريخ استلام المرتجع")}>
                <input
                  className={field}
                  name="returned_on"
                  type="date"
                  defaultValue={cairoDay()}
                  max={cairoDay()}
                  required
                />
              </Label>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  className="mt-1 h-5 w-5 accent-brand"
                  type="checkbox"
                  name="waive_delivery"
                />
                {t(
                  "Waive delivery fee on a full return (no products may remain chargeable)",
                  "إلغاء رسوم التوصيل عند إرجاع الطلب كاملًا فقط",
                )}
              </label>
              {reason()}
              <button className={primary}>
                {t("Record selected returns", "تسجيل المرتجعات المحددة")}
              </button>
            </fieldset>
          </form>
          {Number(o.delivery_fee) > 0 &&
            detail.items.some((item) => item.shipped_quantity > 0) &&
            detail.items.every(
              (item) =>
                item.quantity -
                  item.removed_quantity -
                  item.returned_quantity ===
                0,
            ) && (
              <form
                className="space-y-3 rounded-xl border border-line p-3"
                onSubmit={submit("waive_delivery", () => ({}))}
              >
                <h4 className="font-semibold">
                  {t(
                    "Delivery fee after full return",
                    "رسوم التوصيل بعد إرجاع الطلب كاملًا",
                  )}
                </h4>
                <p className="text-xs text-ink-muted">
                  {t(
                    "Waiving the fee updates the amount refundable. Record any actual refund separately.",
                    "إلغاء الرسوم يغيّر المبلغ المستحق للرد. سجّل رد المال الفعلي منفصلًا.",
                  )}
                </p>
                <fieldset disabled={disabled} className="space-y-3">
                  {reason()}
                  <button className={button}>
                    {t("Waive delivery fee", "إلغاء رسوم التوصيل")}
                  </button>
                </fieldset>
              </form>
            )}
          <ul className="divide-y divide-line">
            {detail.returns.map((entry) => (
              <li key={entry.id} className="space-y-1 py-3 text-sm">
                <p className="font-semibold">
                  {t("Return received", "استلام مرتجع")} ·{" "}
                  {entry.returned_on ?? date(entry.created_at)}
                </p>
                {entry.reason && <p>{entry.reason}</p>}
                <ul>
                  {entry.lines?.map((line) => (
                    <li key={line.item_id}>
                      {name(
                        detail.items.find((item) => item.id === line.item_id) ??
                          ({
                            name_en: t("Product", "منتج"),
                            name_ar: "منتج",
                          } as AdjustmentItem),
                      )}{" "}
                      × {line.quantity} ·{" "}
                      {line.restock
                        ? t("Returned to stock", "أُعيد للمخزون")
                        : t("Not restocked", "لم يُعد للمخزون")}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div hidden={section !== "history"} className={panel}>
          <h3 className="font-semibold">
            {t("Private order notes", "ملاحظات الطلب الداخلية")}
          </h3>
          <form
            className={formClass}
            onSubmit={submit("note", (form) => ({ text: text(form, "note") }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <Label title={t("Internal note", "ملاحظة داخلية")}>
                <textarea
                  className={field}
                  rows={3}
                  name="note"
                  required
                  maxLength={2000}
                />
              </Label>
              <button className={primary}>
                {t("Add private note", "إضافة ملاحظة داخلية")}
              </button>
            </fieldset>
          </form>
          <ul className="divide-y divide-line">
            {detail.notes.map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <p className="whitespace-pre-wrap break-words">
                  {n.text ??
                    String(
                      (
                        n.payload?.request as
                          Record<string, unknown> | undefined
                      )?.text ??
                        n.payload?.text ??
                        "",
                    )}
                </p>
                <time className="text-xs text-ink-muted">
                  {date(n.created_at ?? n.occurred_at)}
                </time>
              </li>
            ))}
          </ul>
          <h3 className="border-t border-line pt-3 font-semibold">
            {t("Order timeline", "سجل الطلب")}
          </h3>
          <ol className="divide-y divide-line">
            {detail.timeline.map((event) => (
              <li key={event.id} className="space-y-1 py-3 text-sm">
                <p className="font-semibold">
                  {actionLabel(event.action ?? event.kind ?? event.event_type)}
                </p>
                {event.reason && (
                  <p className="whitespace-pre-wrap break-words">
                    {event.reason}
                  </p>
                )}
                <ul className="space-y-1 text-xs text-ink-muted">
                  {timelineSummary(event).map((line, index) => (
                    <li key={index} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-muted">
                  {date(event.created_at ?? event.occurred_at)} ·{" "}
                  {event.actor_label ||
                    (event.actor_id
                      ? `${t("Admin", "الإدارة")} ${event.actor_id.slice(0, 8)}`
                      : t("Automatic", "تلقائي"))}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div hidden={section !== "recovery"} className={panel}>
          <h3 className="font-semibold">
            {t("Controlled corrections", "تصحيحات بضوابط")}
          </h3>
          <form
            className={formClass}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              if (await mutate(text(form, "action"), {}, text(form, "reason")))
                form.reset();
            }}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <Label title={t("Order action", "إجراء الطلب")}>
                <select className={field} name="action" defaultValue="confirm">
                  <option value="confirm">
                    {t("Confirm order", "تأكيد الطلب")}
                  </option>
                  <option value="cancel">
                    {t("Cancel outstanding items", "إلغاء المنتجات المتبقية")}
                  </option>
                  <option value="reopen">
                    {t(
                      "Reopen cancelled/expired order",
                      "إعادة فتح طلب ملغي أو منتهي",
                    )}
                  </option>
                </select>
              </Label>
              {reason()}
              <button className={button}>
                {t("Apply order action", "تطبيق إجراء الطلب")}
              </button>
            </fieldset>
          </form>
          <form
            className="space-y-3 border-t border-line pt-3"
            onSubmit={submit("extend", (form) => ({
              expires_at: new Date(text(form, "expires")).toISOString(),
            }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <Label
                title={t(
                  "New reservation deadline (your device time)",
                  "نهاية الحجز الجديدة (بتوقيت جهازك)",
                )}
              >
                <input
                  className={field}
                  name="expires"
                  type="datetime-local"
                  required
                />
              </Label>
              {reason()}
              <button className={button}>
                {t("Extend unpaid reservation", "تمديد الحجز غير المدفوع")}
              </button>
            </fieldset>
          </form>
          <form
            className="space-y-3 border-t border-line pt-3"
            onSubmit={submit("order_date", (form) => ({
              ordered_on: text(form, "ordered_on"),
            }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <Label
                title={t(
                  "Correct original order date (Cairo)",
                  "تصحيح تاريخ الطلب الأصلي (القاهرة)",
                )}
              >
                <input
                  className={field}
                  name="ordered_on"
                  type="date"
                  defaultValue={
                    o.ordered_at
                      ? new Intl.DateTimeFormat("en-CA", {
                          timeZone: "Africa/Cairo",
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(o.ordered_at))
                      : ""
                  }
                  max={cairoDay()}
                  required
                />
              </Label>
              {reason()}
              <button className={button}>
                {t("Correct order date", "تصحيح تاريخ الطلب")}
              </button>
            </fieldset>
          </form>
          <form
            className="space-y-3 border-t border-line pt-3"
            onSubmit={submit("payment_date", (form) => ({
              event_id: number(form, "event_id"),
              date: text(form, "date"),
            }))}
          >
            <fieldset
              disabled={disabled || !finance?.payments?.length}
              className="space-y-3"
            >
              <Label title={t("Payment/refund entry", "قيد الدفع أو الرد")}>
                <select
                  className={field}
                  name="event_id"
                  required
                  defaultValue=""
                >
                  <option value="">{t("Choose an entry", "اختر القيد")}</option>
                  {finance?.payments?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {actionLabel(p.event_type)} · {money(p.amount)} ·{" "}
                      {date(p.occurred_at)}
                    </option>
                  ))}
                </select>
              </Label>
              <Label
                title={t(
                  "Correct original date (Cairo)",
                  "تصحيح التاريخ الأصلي (القاهرة)",
                )}
              >
                <input
                  className={field}
                  name="date"
                  type="date"
                  max={cairoDay()}
                  required
                />
              </Label>
              {reason()}
              <button className={button}>
                {t("Correct payment date", "تصحيح تاريخ القيد المالي")}
              </button>
            </fieldset>
          </form>
          <form
            className="space-y-3 border-t border-line pt-3"
            onSubmit={submit("undo_shipment", (form) => ({
              shipment_id: text(form, "shipment_id"),
              confirmed_not_dispatched: true,
            }))}
          >
            <fieldset disabled={disabled} className="space-y-3">
              <Label
                title={t("Shipment recorded by mistake", "شحنة سُجلت بالخطأ")}
              >
                <select
                  className={field}
                  name="shipment_id"
                  defaultValue=""
                  required
                >
                  <option value="">
                    {t("Choose a shipment", "اختر الشحنة")}
                  </option>
                  {detail.shipments
                    .filter(
                      (s) =>
                        !s.voided_at &&
                        !s.delivered_on &&
                        !s.legacy_delivered &&
                        !(
                          s.lines?.some(
                            (line) => Number(line.returned_quantity) > 0,
                          ) ?? false
                        ),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.courier || t("Shipment", "شحنة")} ·{" "}
                        {s.tracking_number || s.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </Label>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  className="mt-1 h-5 w-5 accent-brand"
                  type="checkbox"
                  required
                />
                {t(
                  "The products never left the shop. Actual returned deliveries must use Returns instead.",
                  "المنتجات لم تغادر المتجر. الشحنات التي عادت فعلًا تُسجّل من المرتجعات.",
                )}
              </label>
              {reason()}
              <button className={button}>
                {t("Undo mistaken shipment", "التراجع عن شحنة مسجلة بالخطأ")}
              </button>
            </fieldset>
          </form>
        </div>
      </div>
    </section>
  );
}
