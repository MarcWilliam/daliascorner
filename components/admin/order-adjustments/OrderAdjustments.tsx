"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { CorrectionActions } from "./CorrectionActions";
import {
  nextOrderAction,
  type AdjustmentSection,
} from "@/lib/store/order-adjustment-navigation";
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
  type AdjustmentPayment,
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
const field = "store-field mt-1";
const compactField = field + " h-11";
const pairedFields = "grid gap-x-3 gap-y-2 min-[480px]:grid-cols-2";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-40";
const primary = button + " bg-brand text-canvas hover:bg-brand/90";
const formClass = "space-y-3";
const panel = "space-y-2 rounded-xl border border-line bg-surface p-3";
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

function CatalogAddition({
  ar,
  children,
}: {
  ar: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const product = useRef<HTMLSelectElement>(null);
  const add = ar ? "إضافة منتج" : "Add product";
  const close = ar ? "إخفاء إضافة المنتج" : "Close product addition";

  useEffect(() => {
    if (open) product.current?.focus();
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <span aria-hidden="true" className="text-sm text-ink-muted">
          {add}
        </span>
        <button
          ref={toggle}
          type="button"
          className={button + " h-11 w-11 !p-0"}
          aria-label={open ? close : add}
          aria-expanded={open}
          aria-controls={panelId}
          title={open ? close : add}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <fieldset
        id={panelId}
        hidden={!open}
        disabled={!open}
        className="rounded-xl border border-line bg-canvas-sunk p-3"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <div className="grid gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_5rem]">
          <Label title={ar ? "منتج الكتالوج" : "Catalog product"}>
            <select
              ref={product}
              className={compactField}
              name="product"
              defaultValue=""
            >
              <option value="">
                {ar ? "اختر منتجًا" : "Choose a product"}
              </option>
              {children}
            </select>
          </Label>
          <Label title={ar ? "الكمية" : "Quantity"}>
            <input
              className={compactField}
              name="add_qty"
              type="number"
              min={1}
              max={99}
              step={1}
              defaultValue={1}
            />
          </Label>
        </div>
      </fieldset>
    </div>
  );
}

export function OrderAdjustments({
  orderId,
  paymentMethod,
  onSaved,
  onBusyChange,
}: {
  orderId: string;
  paymentMethod: string;
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
  const [moreOpen, setMoreOpen] = useState(false),
    [nextSequence, setNextSequence] = useState(0),
    [selectedSection, setSelectedSection] = useState<AdjustmentSection | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [generation, setGeneration] = useState(0);
  const [additionVersion, setAdditionVersion] = useState(0);
  const toolsId = useId();
  const [paymentDraft, setPaymentDraft] = useState<{
    id: number;
    mode: "edit" | "delete";
  } | null>(null);
  const paymentTrigger = useRef<HTMLButtonElement | null>(null);
  const paymentsHeading = useRef<HTMLHeadingElement>(null);
  function closePaymentDraft(deleted = false) {
    setPaymentDraft(null);
    requestAnimationFrame(() => {
      (deleted ? paymentsHeading.current : paymentTrigger.current)?.focus();
    });
  }
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
    setSelectedSection(null);
    setPaymentDraft(null);
    setMoreOpen(false);
    setNextSequence(0);
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
      setPaymentDraft(null);
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
        else if (code.includes("INVALID_PAYMENT_SEQUENCE"))
          setError(t(
            "This change would leave a refund without enough earlier payments. Review the amounts and dates.",
            "سيترك هذا التغيير مبلغًا مردودًا دون دفعات سابقة كافية. راجع المبالغ والتواريخ.",
          ));
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
  const reason = (className = field) => (
    <Label title={t("Reason (optional)", "السبب (اختياري)")}>
      <input
        className={className}
        name="reason"
        maxLength={1000}
      />
    </Label>
  );
  if (!detail)
    return (
      <section className={panel} aria-busy={loading}>
        <p role={error ? "alert" : "status"}>
          {error ||
            t("Loading order adjustments…", "جارٍ تحميل تعديلات الطلب…")}
        </p>
        {error && (
          <button
            className={button}
            type="button"
            disabled={loading}
            onClick={() => void reload()}
          >
            {t("Try again", "إعادة المحاولة")}
          </button>
        )}
      </section>
    );
  const o = detail.order,
    finance = detail.finance;
  const recommendation = nextOrderAction(detail);
  const section = selectedSection ?? recommendation.section;
  const tabs: { id: AdjustmentSection; label: string }[] = [
    { id: "details", label: t("Customer & delivery", "العميل والتوصيل") },
    { id: "items", label: t("Items & replacements", "المنتجات والبدائل") },
    { id: "shipping", label: t("Shipments", "الشحنات") },
    { id: "payments", label: t("Payments", "الدفع") },
    { id: "returns", label: t("Returns", "المرتجعات") },
    { id: "history", label: t("History & notes", "السجل والملاحظات") },
    { id: "recovery", label: t("Order actions", "إجراءات الطلب") },
  ];
  const otherTab = section !== recommendation.section
    ? recommendation.section
    : section === "payments" ? "shipping" : "payments";
  const visibleTabs = tabs.filter(({ id }) => moreOpen || id === section || id === otherTab);
  const tabId = (id: AdjustmentSection) => `${toolsId}-tab-${id}`;
  const panelId = (id: AdjustmentSection) => `${toolsId}-panel-${id}`;
  const panelProps = (id: AdjustmentSection) => ({
    id: panelId(id),
    role: "tabpanel",
    "aria-labelledby": tabId(id),
    hidden: section !== id,
    tabIndex: 0,
    className: panel,
  });
  const nextLabel = {
    confirm: t("Confirm order", "تأكيد الطلب"),
    extend: t("Review expired hold", "مراجعة الحجز المنتهي"),
    reopen: t("Reopen order", "إعادة فتح الطلب"),
    ship: t("Ship remaining items", "شحن المنتجات المتبقية"),
    deliver: t("Review delivery", "مراجعة التسليم"),
    payment: t("Record a payment", "تسجيل دفعة"),
    refund: t("Review refund due", "مراجعة المبلغ المطلوب رده"),
    history: t("Review order history", "مراجعة سجل الطلب"),
  }[recommendation.kind];
  const paymentStatus = ({
    unpaid: Number(finance?.balance_due) > 0
      ? t("Pending payment", "بانتظار الدفع")
      : t("No payment due", "لا يوجد مبلغ مستحق"),
    partial: t("Partially paid", "مدفوع جزئيًا"),
    paid: t("Payment received", "تم استلام الدفع"),
    overpaid: t("Refund due", "مبلغ مستحق للرد"),
    refunded: t("Refunded", "تم رد المبلغ"),
  } as Record<string, string>)[finance?.payment_state] ?? t("Payment status unavailable", "حالة الدفع غير متاحة");
  const disabled = busy || loading || locked;
  const canShip =
    ["confirmed", "shipped"].includes(o.status) &&
    detail.items.some((item) => remainingUnits(item) > 0);
  const canReturn = detail.items.some((item) => returnableUnits(item) > 0);
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
      opening_paid: t("Opening payment", "دفعة سابقة"),
      correction: t("Balance correction", "تصحيح الرصيد"),
      payment_edit: t("Payment entry edited", "تعديل قيد الدفع"),
      payment_delete: t("Payment entry deleted", "حذف قيد الدفع"),
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
  const paymentFields = (entry?: AdjustmentPayment) => (
    <div className={pairedFields}>
      {!entry && (
        <Label title={t("Entry type", "نوع القيد")}>
          <select className={compactField} name="kind" defaultValue={recommendation.kind === "refund" ? "refund" : "payment"}>
            <option value="payment">{t("Payment received", "مبلغ مستلم")}</option>
            <option value="refund">{t("Refund sent", "مبلغ تم رده")}</option>
          </select>
        </Label>
      )}
      <Label title={t("Amount (EGP)", "المبلغ (جنيه)")}>
        <input
          className={compactField}
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          max="9999999999.99"
          defaultValue={entry ? Math.abs(Number(entry.amount)) : undefined}
          autoFocus={Boolean(entry)}
          required
          inputMode="decimal"
        />
      </Label>
      <Label title={t("Payment or refund date", "تاريخ الدفع أو الرد")}>
        <input
          className={compactField}
          type="date"
          name="date"
          defaultValue={entry ? (entry.occurred_at ? cairoDay(new Date(entry.occurred_at)) : "") : cairoDay()}
          max={cairoDay()}
          required={!entry || Boolean(entry.occurred_at)}
        />
      </Label>
      <Label title={t("Payment reference", "مرجع الدفع")}>
        <input className={compactField} name="reference" defaultValue={entry?.reference} maxLength={300} />
      </Label>
      {reason(compactField)}
    </div>
  );
  const paymentValues = (form: HTMLFormElement) => ({
    amount: number(form, "amount"),
    date: text(form, "date"),
    reference: text(form, "reference"),
  });
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
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-line p-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              {picture && (
                <img
                  src={picture.thumb}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{name(i)}</p>
                <p className="text-xs text-ink-muted">
                  {t("Ordered", "المطلوب")}: {activeUnits(i)}
                  {i.shipped_quantity > 0 && (
                    <>
                      {" "}
                      · {t("Shipped", "المشحون")}: {i.shipped_quantity}
                    </>
                  )}
                  {(mode === "ship" || i.reserved_quantity > 0) && (
                    <>
                      {" "}
                      · {t("Held", "المحجوز")}: {i.reserved_quantity || 0}
                    </>
                  )}
                  {i.returned_quantity > 0 && (
                    <>
                      {" "}
                      · {t("Returned", "المرتجع")}: {i.returned_quantity}
                    </>
                  )}
                </p>
              </div>
            </div>
            <label className="w-20 text-xs text-ink-muted">
              {mode === "edit"
                ? t("Keep on order", "الكمية في الطلب")
                : mode === "ship"
                  ? t("Ship now", "اشحن الآن")
                  : t("Return now", "أرجع الآن")}
              <input
                className={compactField}
                type="number"
                name={`qty:${i.id}`}
                min={mode === "edit" ? Number(i.shipped_quantity || 0) : 0}
                max={available}
                step={1}
                defaultValue={mode === "edit" ? activeUnits(i) : 0}
                disabled={mode !== "edit" && available === 0}
                aria-label={`${mode === "edit" ? t("Order quantity", "كمية الطلب") : mode === "ship" ? t("Shipment quantity", "كمية الشحنة") : t("Return quantity", "كمية المرتجع")} — ${name(i)}`}
              />
            </label>
            {mode === "return" && available > 0 && (
              <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
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
      className="space-y-3"
      aria-label={t("Order adjustments", "تعديلات الطلب")}
      aria-busy={busy || loading}
    >
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
        <p>
          <span className="text-ink-muted">{t("Payment method", "طريقة الدفع")}</span>
          <strong className="ms-2">
            {paymentMethod === "transfer" ? t("InstaPay", "إنستا باي") : t("Cash on delivery", "الدفع عند الاستلام")}
          </strong>
        </p>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${finance?.payment_state === "paid" ? "bg-leaf-soft text-brand" : "bg-canvas-sunk text-ink"}`}>
          {paymentStatus}
        </span>
        <dl className="flex w-full flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-xs">
          <div className="flex flex-wrap gap-x-1">
            <dt className="text-ink-muted">{t("Net received", "صافي المقبوض")}</dt>
            <dd className="font-semibold">{money(finance?.net_collected)}</dd>
          </div>
          {Number(finance?.balance_due) > 0 && (
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-ink-muted">{t("Amount due", "المتبقي للدفع")}</dt>
              <dd className="font-semibold">{money(finance.balance_due)}</dd>
            </div>
          )}
          {Number(finance?.refund_due) > 0 && (
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-ink-muted">{t("Refund due", "المطلوب رده")}</dt>
              <dd className="font-semibold">{money(finance.refund_due)}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">
            {t("Next action", "الخطوة التالية")}
          </p>
          <button
            type="button"
            className="min-h-11 text-start text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-40"
            disabled={busy}
            onClick={() => {
              setSelectedSection(null);
              setNextSequence((value) => value + 1);
            }}
          >
            {nextLabel}
          </button>
        </div>
        <button
          type="button"
          className={button + " gap-1"}
          disabled={busy}
          aria-expanded={moreOpen}
          aria-controls={`${toolsId}-tabs`}
          onClick={() => {
            setMoreOpen((value) => !value);
          }}
        >
          {moreOpen ? t("Show less", "عرض أقل") : t("More", "المزيد")}
          <ChevronDown className={moreOpen ? "rotate-180" : ""} size={16} aria-hidden />
        </button>
      </div>
      <div
        id={`${toolsId}-tabs`}
        role="tablist"
        aria-label={t("Order tools", "أدوات الطلب")}
        className="flex flex-wrap gap-1.5"
      >
        {visibleTabs.map(({ id, label }, index) => (
          <button
            key={id}
            id={tabId(id)}
            role="tab"
            type="button"
            aria-selected={section === id}
            aria-controls={panelId(id)}
            tabIndex={section === id ? 0 : -1}
            disabled={busy}
            className={section === id ? primary : button}
            onClick={() => setSelectedSection(id)}
            onKeyDown={(event) => {
              const last = visibleTabs.length - 1;
              const step = ar ? -1 : 1;
              const offset = event.key === "ArrowRight" ? step : -step;
              let next: number;
              switch (event.key) {
                case "ArrowRight":
                case "ArrowLeft":
                  next = (index + offset + visibleTabs.length) % visibleTabs.length;
                  break;
                case "Home":
                  next = 0;
                  break;
                case "End":
                  next = last;
                  break;
                default:
                  return;
              }
              event.preventDefault();
              const target = visibleTabs[next].id;
              setSelectedSection(target);
              document.getElementById(tabId(target))?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
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
      {locked && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={button}
            disabled={busy || loading}
            onClick={() => void reload()}
          >
            {t("Load latest order", "تحميل آخر نسخة")}
          </button>
          <span className="text-xs text-ink-muted">
            {t("Replaces unsaved entries.", "يستبدل المدخلات غير المحفوظة.")}
          </span>
        </div>
      )}
      <div key={generation}>
        <div {...panelProps("details")}>
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
        <div {...panelProps("items")}>
          <h3 className="font-semibold">
            {t("Items & agreed replacements", "المنتجات والبدائل المتفق عليها")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Reduce an unshipped quantity to remove items. Add agreed replacements at catalog price. Any difference updates the balance.",
              "قلّل الكمية غير المشحونة لإزالة منتجات. أضف البدائل المتفق عليها بسعر الكتالوج. يظهر أي فرق في الرصيد.",
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
              )
                setAdditionVersion((version) => version + 1);
            }}
          >
            <fieldset disabled={disabled} className="space-y-2">
              {itemPicker("edit")}
              <CatalogAddition ar={ar} key={additionVersion}>
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {catalogName(p.product_id, ar ? p.name_ar : p.name_en)} ·{" "}
                      {money(p.price)}
                    </option>
                  ))}
              </CatalogAddition>
              <div className="grid items-end gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto]">
                {reason(compactField)}
                <button type="submit" className={primary}>
                  {t("Save item adjustment", "حفظ تعديل المنتجات")}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
        <div {...panelProps("shipping")}>
          <h3 className="font-semibold">{t("Shipments", "الشحنات")}</h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Each shipment releases remaining holds. Unshipped items stay on the order and get a fresh stock check next time.",
              "تُحرر كل شحنة باقي الحجز. تبقى المنتجات غير المشحونة في الطلب، ويُراجع المخزون عند شحنها لاحقًا.",
            )}
          </p>
          {canShip ? (
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
              <fieldset disabled={disabled} className="space-y-2">
                {itemPicker("ship")}
                <div className={pairedFields}>
                  <Label title={t("Courier", "شركة الشحن")}>
                    <input
                      className={compactField}
                      name="courier"
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
                      className={compactField}
                      name="tracking"
                      maxLength={200}
                      dir="ltr"
                    />
                  </Label>
                  <Label title={t("Dispatch date", "تاريخ الشحن")}>
                    <input
                      className={compactField}
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
                    <input
                      className={compactField}
                      type="date"
                      name="expected"
                    />
                  </Label>
                </div>
                <div className="grid items-end gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto]">
                  {reason(compactField)}
                  <button className={primary} type="submit">
                    {t(
                      "Record selected shipment",
                      "تسجيل شحنة المنتجات المحددة",
                    )}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : o.status === "pending" ? (
            <p className="text-sm text-ink-muted">
              {t(
                "Confirm the order before recording a shipment.",
                "أكّد الطلب قبل تسجيل الشحنة.",
              )}
            </p>
          ) : null}

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
        <div {...panelProps("payments")}>
          <h3 ref={paymentsHeading} tabIndex={-1} className="font-semibold">
            {t("Payments", "الدفع")}
          </h3>
          <form
            hidden={paymentDraft !== null}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              setSelectedSection("payments");
              if (await mutate(text(form, "kind"), paymentValues(form), text(form, "reason"))) form.reset();
            }}
          >
            <fieldset disabled={disabled || paymentDraft !== null} className="space-y-2">
              {paymentFields()}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-muted">
                  {t("Record money received or returned.", "سجّل المبالغ المستلمة أو المردودة.")}
                </p>
                <button className={primary} type="submit">
                  {t("Record entry", "تسجيل القيد")}
                </button>
              </div>
            </fieldset>
          </form>
          {!!finance?.payments?.length && (
            <ul className="divide-y divide-line border-t border-line">
              {finance.payments.map((entry) => {
                const mode = paymentDraft?.id === entry.id ? paymentDraft.mode : null;
                return (
                  <li key={entry.id} className="space-y-2 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{actionLabel(entry.event_type)}</p>
                        <p className="break-words text-xs text-ink-muted">
                          {date(entry.occurred_at)}
                          {entry.reference ? ` · ${entry.reference}` : ""}
                        </p>
                      </div>
                      <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
                        <strong className="tabular-nums">{money(entry.amount)}</strong>
                        {entry.event_type !== "correction" && (
                          <div className="flex gap-1">
                            {(["edit", "delete"] as const).map((action) => (
                              <button
                                key={action}
                                type="button"
                                className="min-h-11 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-canvas-sunk focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-40"
                                aria-expanded={mode === action}
                                aria-controls={mode === action ? `${toolsId}-payment-${entry.id}` : undefined}
                                disabled={disabled}
                                onClick={(event) => {
                                  paymentTrigger.current = event.currentTarget;
                                  if (mode === action) closePaymentDraft();
                                  else setPaymentDraft({ id: entry.id, mode: action });
                                }}
                              >
                                {action === "edit" ? t("Edit", "تعديل") : t("Delete", "حذف")}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {mode && (
                      <form
                        key={mode}
                        id={`${toolsId}-payment-${entry.id}`}
                        className="rounded-lg bg-canvas-sunk p-2"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          setSelectedSection("payments");
                          const payload = mode === "edit" ? paymentValues(form) : {};
                          if (await mutate(mode === "edit" ? "payment_edit" : "payment_delete", { event_id: entry.id, ...payload }, text(form, "reason"))) {
                            closePaymentDraft(mode === "delete");
                          }
                        }}
                      >
                        <fieldset disabled={disabled} className="space-y-2">
                          {mode === "edit" ? paymentFields(entry) : (
                            <>
                              <p>{t("Delete this entry from the order balance and finance report?", "حذف هذا القيد من رصيد الطلب والتقرير المالي؟")}</p>
                              {reason(compactField)}
                            </>
                          )}
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" className={button} autoFocus={mode === "delete"} onClick={() => closePaymentDraft()}>
                              {t("Cancel", "إلغاء")}
                            </button>
                            <button type="submit" className={primary}>
                              {mode === "edit" ? t("Save changes", "حفظ التغييرات") : t("Delete entry", "حذف القيد")}
                            </button>
                          </div>
                        </fieldset>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div {...panelProps("returns")}>
          <h3 className="font-semibold">
            {t("Returned products & exchanges", "المنتجات المرتجعة والاستبدال")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t(
              "Record products actually returned. Check Return to stock only for sellable pieces physically received. Refunds are recorded separately. For an agreed exchange, add its replacement from Items after recording the return.",
              "سجّل المنتجات التي عادت فعليًا. اختر إعادة للمخزون فقط للقطع الصالحة للبيع التي استلمتها. سجّل رد المال منفصلًا. للاستبدال المتفق عليه أضف البديل من المنتجات بعد تسجيل المرتجع.",
            )}
          </p>
          {canReturn ? (
            <form
              className={formClass}
              onSubmit={submit("return", (form) => ({
                lines: lines(form, "return"),
                returned_on: text(form, "returned_on"),
                waive_delivery:
                  new FormData(form).get("waive_delivery") === "on",
              }))}
            >
              <fieldset disabled={disabled} className="space-y-3">
                {itemPicker("return")}
                <Label
                  title={t("Return received date", "تاريخ استلام المرتجع")}
                >
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
          ) : (
            <p className="text-sm text-ink-muted">
              {t(
                "No shipped items remain to return.",
                "لا توجد منتجات مشحونة متبقية للإرجاع.",
              )}
            </p>
          )}

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
        <div {...panelProps("history")}>
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
        <div {...panelProps("recovery")}>
          <CorrectionActions
            detail={detail}
            disabled={disabled}
            submit={submit}
            reason={reason}
            preset={{
              action: recommendation.correction,
              sequence: nextSequence,
            }}
          />
        </div>
      </div>
    </section>
  );
}
