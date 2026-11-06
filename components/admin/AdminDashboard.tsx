"use client";
import { MetaHealth } from "./MetaHealth";
import { FinancePanel } from "./FinancePanel";
import { CheckoutSettings } from "./CheckoutSettings";
import { InventoryPanel, type Stock, type Movement } from "./InventoryPanel";
import { ManualOrderForm } from "./ManualOrderForm";
import { PRODUCTS } from "@/lib/products";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { accountRequestScope } from "@/lib/store/customer-account";
import {
  Package,
  ShoppingBag,
  Bell,
  ArrowLeft,
  Settings,
  WalletCards,
  ChartNoAxesCombined,
  Plus,
} from "lucide-react";
import { ClayButton } from "@/components/ui/ClayButton";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeCopy } from "@/lib/store/copy";
import { STORE_CONFIGURED, storeClient } from "@/lib/store/client";
import { enablePush, disablePush } from "@/lib/store/push";
import { asset } from "@/lib/asset";

type Status =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "expired";
type Order = {
  id: string;
  order_number: number;
  status: Status;
  payment_status: "unpaid" | "paid" | "refunded";
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  subtotal: number;
  delivery_fee: number;
  delivery_zone: string;
  payment_method: string;
  created_at: string;
  ordered_at?: string;
  is_historical?: boolean;
  stock_handling?: "already_accounted" | "deduct_now" | null;
  expires_at: string;
  source: "website" | "chat";
  order_items: {
    id: number;
    product_id: string;
    name_en: string;
    name_ar: string;
    quantity: number;
    unit_price: number;
  }[];
};
type Notice = {
  id: number;
  kind: string;
  read_at: string | null;
  created_at: string;
  product_id: string | null;
};
const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
export function AdminDashboard() {
  const { locale, dir } = useLocale();
  const c = storeCopy[locale];
  const {
    session,
    ready: authReady,
    isAdmin,
    roleReady,
    roleError,
    refreshRole,
  } = useCustomerAuth();
  const admin = !!session && roleReady && isAdmin;
  const checking = !!session && !roleReady;
  const viewer = useRef<string | null>(null);
  viewer.current = session?.user.id ?? null;
  const dataRequests = useRef(accountRequestScope());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [tab, setTab] = useState<
    "orders" | "stock" | "settings" | "notifications" | "meta" | "finance"
  >("orders");
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("all");
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [push, setPush] = useState(false);
  const date = (value: string) =>
    new Date(value).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", {
      timeZone: "Africa/Cairo",
      dateStyle: "medium",
      timeStyle: "short",
    });
  useEffect(() => {
    if (!STORE_CONFIGURED) return;
    const { data } = storeClient().auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      else if (event === "SIGNED_OUT" || event === "SIGNED_IN")
        setRecovery(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    dataRequests.current.cancel();
    setOrders([]);
    setStock([]);
    setNotices([]);
    setMovements([]);
    setShowManualOrder(false);
    setPush(false);
  }, [session?.user.id, admin]);
  const refresh = useCallback(async () => {
    if (!admin || !session) return;
    const userId = session.user.id;
    const request = dataRequests.current.begin();
    const current = () => request.current() && viewer.current === userId;
    setLoading(true);
    try {
      const allowed = await refreshRole();
      if (!current() || !allowed) return;
      const db = storeClient();
      let q = db
        .from("orders")
        .select("*,order_items(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (filter !== "all") q = q.eq("status", filter);
      if (source !== "all") q = q.eq("source", source);
      const results = await Promise.all([
        q.abortSignal(request.signal),
        db
          .from("inventory")
          .select("*")
          .order("product_id")
          .abortSignal(request.signal),
        db
          .from("admin_notifications")
          .select("id,kind,read_at,created_at,product_id")
          .order("created_at", { ascending: false })
          .limit(100)
          .abortSignal(request.signal),
        db
          .from("stock_movements")
          .select(
            "id,product_id,on_hand_delta,reserved_delta,reason,created_at",
          )
          .order("id", { ascending: false })
          .limit(30)
          .abortSignal(request.signal),
      ]);
      if (!current()) return;
      if (results.some((r) => r.error)) throw new Error();
      setOrders(results[0].data as unknown as Order[]);
      setStock(results[1].data as unknown as Stock[]);
      setNotices(results[2].data as unknown as Notice[]);
      setMovements(results[3].data as unknown as Movement[]);
    } catch {
      if (current()) setError(c.error);
    } finally {
      if (current()) setLoading(false);
    }
  }, [admin, session?.user.id, refreshRole, limit, filter, source, c.error]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      dataRequests.current.cancel();
    };
  }, [refresh]);
  useEffect(() => {
    if (!admin || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration(asset("/admin/"))
      .then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPush(Boolean(sub));
      })
      .catch(() => {});
  }, [admin]);
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const code =
        typeof e === "object" && e && "message" in e ? String(e.message) : "";
      setError(
        code.includes("ORDER_EXPIRED")
          ? locale === "ar"
            ? "انتهت مهلة حجز هذا الطلب. حدّث الطلبات وتواصل مع العميل لإنشاء طلب جديد."
            : "This order’s reservation has expired. Refresh orders and contact the customer to place a new order."
          : code.includes("INVALID_TRANSITION")
            ? locale === "ar"
              ? "تغيّرت حالة الطلب أو أن هذا الإجراء غير متاح. حدّث الطلبات وحاول مرة أخرى."
              : "The order changed or this action is unavailable. Refresh orders and try again."
            : code.includes("REFUND_REQUIRES_PAID_ORDER")
              ? locale === "ar"
                ? "يمكن تسجيل استرداد لطلب مدفوع فقط. حدّث الطلبات أولاً."
                : "Only paid orders can be refunded. Refresh orders first."
              : c.error,
      );
    } finally {
      setBusy(false);
    }
  };
  const login = () =>
    action(async () => {
      const { error } = await storeClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setPassword("");
    });
  const logout = () =>
    action(async () => {
      try {
        await disablePush();
      } catch {
        /* Sign out even if push cleanup is offline. */
      }
      const { error } = await storeClient().auth.signOut();
      if (error) throw error;
      setPush(false);
    });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await storeClient().rpc(name, args);
    if (error) throw error;
    await refresh();
    setMessage(locale === "ar" ? "تم حفظ الطلب." : "Order saved.");
  };
  const changeStatus = (o: Order, status: Status) => {
    if (status === "cancelled" && !window.confirm(c.cancelCheck)) return;
    void action(() =>
      rpc("transition_order", { p_id: o.id, p_status: status }),
    );
  };
  return (
    <main dir={dir} className="min-h-screen bg-canvas pb-16 text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a
            href={asset("/")}
            className="inline-flex min-h-12 items-center gap-2 rounded-clay font-semibold text-brand focus-visible:ring-4 focus-visible:ring-brand/45"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {c.home}
          </a>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle />
            {session && (
              <ClayButton
                variant="outline"
                disabled={busy}
                onClick={() => void logout()}
              >
                {c.logout}
              </ClayButton>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-8 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-brand">Dalia’s Corner</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{c.admin}</h1>
          <p className="mt-2 text-ink-muted">{c.subtitle}</p>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-clay border border-clay bg-clay-soft p-4"
          >
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-clay bg-leaf-soft p-4">
            {message}
          </p>
        )}
        {!STORE_CONFIGURED ? (
          <section className={panel}>
            <p>{c.setup}</p>
          </section>
        ) : !authReady || checking ? (
          <p role="status">{c.loading}</p>
        ) : recovery && session && admin ? (
          <form
            className={`${panel} max-w-md space-y-4`}
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const { error } = await storeClient().auth.updateUser({
                  password,
                });
                if (error) throw error;
                setRecovery(false);
                setPassword("");
              });
            }}
          >
            <label className="block">
              {c.newPassword}
              <input
                className={field}
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ClayButton disabled={busy} type="submit">
              {c.savePassword}
            </ClayButton>
          </form>
        ) : !session ? (
          <form
            className={`${panel} max-w-md space-y-5`}
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <label className="block font-semibold">
              {c.email}
              <input
                className={field}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block font-semibold">
              {c.password}
              <input
                className={field}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ClayButton className="w-full" type="submit" disabled={busy}>
              {busy ? c.loading : c.login}
            </ClayButton>
            <button
              className="min-h-12 rounded-clay text-start text-sm font-semibold text-brand underline focus-visible:ring-4 focus-visible:ring-brand/45"
              type="button"
              disabled={busy || !email}
              onClick={() =>
                void action(async () => {
                  const { error } =
                    await storeClient().auth.resetPasswordForEmail(email, {
                      redirectTo: window.location.origin + asset("/admin/"),
                    });
                  if (error) throw error;
                  setMessage(c.resetSent);
                })
              }
            >
              {c.reset}
            </button>
          </form>
        ) : roleError ? (
          <section className={`${panel} space-y-4`}>
            <p role="alert">
              {locale === "ar"
                ? "تعذر التحقق من صلاحيات الإدارة. لم يتم فتح لوحة الإدارة."
                : "Admin access could not be verified. The admin panel has not been opened."}
            </p>
            <ClayButton onClick={() => void refreshRole()}>
              {locale === "ar" ? "إعادة التحقق" : "Check access again"}
            </ClayButton>
            <a
              className="block min-h-11 text-brand underline"
              href={asset("/account/")}
            >
              {locale === "ar" ? "حسابي وطلباتي" : "My account & orders"}
            </a>
          </section>
        ) : !admin ? (
          <section className={panel}>
            <p role="alert">{c.denied}</p>
            <p className="mt-3 text-sm text-ink-muted">
              {locale === "ar"
                ? "تسجيل الدخول أو إنشاء حساب عميل لا يمنح صلاحيات الإدارة."
                : "Signing in or creating a customer account does not grant admin access."}
            </p>
            <ClayButton
              className="mt-4"
              href={asset("/account/")}
              variant="outline"
            >
              {locale === "ar" ? "حسابي وطلباتي" : "My account & orders"}
            </ClayButton>
          </section>
        ) : (
          <>
            <nav aria-label={c.admin} className="flex flex-wrap gap-2">
              {(
                [
                  "orders",
                  "stock",
                  "finance",
                  "settings",
                  "notifications",
                  "meta",
                ] as const
              ).map((key) => {
                const Icon =
                  key === "orders"
                    ? ShoppingBag
                    : key === "stock"
                      ? Package
                      : key === "finance"
                        ? WalletCards
                        : key === "settings"
                          ? Settings
                          : key === "meta"
                            ? ChartNoAxesCombined
                            : Bell;
                return (
                  <ClayButton
                    key={key}
                    variant={tab === key ? "primary" : "outline"}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                    {key === "finance"
                      ? locale === "ar"
                        ? "المالية"
                        : "Finance"
                      : key === "settings"
                        ? locale === "ar"
                          ? "الإعدادات"
                          : "Settings"
                        : c[key]}
                    {key === "notifications" &&
                      notices.some((n) => !n.read_at) && (
                        <span>
                          ({notices.filter((n) => !n.read_at).length})
                        </span>
                      )}
                  </ClayButton>
                );
              })}
              <ClayButton
                variant="outline"
                disabled={loading || busy}
                onClick={() => void refresh()}
              >
                {loading ? c.loading : c.refresh}
              </ClayButton>
            </nav>
            {showManualOrder && (
              <div hidden={tab !== "orders"}>
                <ManualOrderForm
                  actorId={session.user.id}
                  stock={stock}
                  onSaved={refresh}
                  onCancel={() => setShowManualOrder(false)}
                  onViewOrder={(number) => {
                    setFilter("all");
                    setSource("all");
                    setOrderSearch(`DC-${number}`);
                    setLimit(25);
                    setShowManualOrder(false);
                  }}
                />
              </div>
            )}
            {tab === "orders" && (
              <section aria-label={c.orders} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl">{c.orders}</h2>
                  {!showManualOrder && (
                    <ClayButton
                      onClick={() => setShowManualOrder(true)}
                      disabled={loading}
                    >
                      <Plus aria-hidden="true" className="h-5 w-5" />
                      {locale === "ar"
                        ? "إضافة طلب من المحادثات"
                        : "Add chat order"}
                    </ClayButton>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    {locale === "ar"
                      ? "البحث في الطلبات المحملة"
                      : "Search loaded orders"}
                    <input
                      className={field}
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder={
                        locale === "ar"
                          ? "رقم الطلب، الاسم أو الهاتف"
                          : "Order number, name or phone"
                      }
                    />
                  </label>
                  <label className="block">
                    {c.orders}
                    <select
                      className={field}
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setLimit(25);
                      }}
                    >
                      <option value="all">{c.all}</option>
                      {(
                        [
                          "pending",
                          "confirmed",
                          "shipped",
                          "delivered",
                          "cancelled",
                          "expired",
                        ] as const
                      ).map((s) => (
                        <option key={s} value={s}>
                          {c[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    {locale === "ar" ? "مصدر الطلب" : "Order source"}
                    <select
                      className={field}
                      value={source}
                      onChange={(e) => {
                        setSource(e.target.value);
                        setLimit(25);
                      }}
                    >
                      <option value="all">
                        {locale === "ar" ? "كل المصادر" : "All sources"}
                      </option>
                      <option value="website">
                        {locale === "ar" ? "الموقع" : "Website"}
                      </option>
                      <option value="chat">
                        {locale === "ar" ? "المحادثات" : "Chat"}
                      </option>
                    </select>
                  </label>
                </div>
                <p className="text-sm text-ink-muted" role="status">
                  {loading
                    ? c.loading
                    : `${orders.length} ${locale === "ar" ? "طلبات محملة · آخر ما تم تسجيله أولاً" : "orders loaded · latest recorded first"}`}
                </p>
                {!loading && !orders.length && (
                  <p className={panel}>{c.empty}</p>
                )}
                {!loading &&
                  orders.length > 0 &&
                  !orders.some((o) =>
                    `DC-${o.order_number} ${o.customer_name} ${o.customer_phone}`
                      .toLowerCase()
                      .includes(orderSearch.trim().toLowerCase()),
                  ) && (
                    <p className={panel}>
                      {locale === "ar"
                        ? "لا توجد طلبات تطابق البحث ضمن الطلبات المحملة. غيّر البحث أو حمّل المزيد من الطلبات."
                        : "No loaded orders match your search. Change the search or load more orders."}
                    </p>
                  )}
                {orders
                  .filter((o) =>
                    `DC-${o.order_number} ${o.customer_name} ${o.customer_phone}`
                      .toLowerCase()
                      .includes(orderSearch.trim().toLowerCase()),
                  )
                  .map((o) => (
                    <article className={panel} key={o.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl">DC-{o.order_number}</h2>
                          <p className="mt-1 text-sm text-ink-muted">
                            {o.is_historical
                              ? new Date(
                                  o.ordered_at ?? o.created_at,
                                ).toLocaleDateString(
                                  locale === "ar" ? "ar-EG" : "en-GB",
                                  {
                                    timeZone: "Africa/Cairo",
                                    dateStyle: "medium",
                                  },
                                )
                              : date(o.ordered_at ?? o.created_at)}
                          </p>
                          {o.is_historical && (
                            <p className="mt-1 text-xs text-ink-muted">
                              {locale === "ar" ? "تم التسجيل" : "Recorded"}:{" "}
                              {date(o.created_at)} ·{" "}
                              {o.stock_handling === "already_accounted"
                                ? locale === "ar"
                                  ? "المخزون محسوب مسبقًا"
                                  : "Stock already accounted for"
                                : locale === "ar"
                                  ? "تم خصم المخزون عند التسجيل"
                                  : "Stock deducted when recorded"}
                            </p>
                          )}
                          <p className="mt-2 text-xs font-semibold text-brand">
                            {o.source === "chat"
                              ? locale === "ar"
                                ? o.is_historical
                                  ? "طلب سابق من المحادثات"
                                  : "طلب من المحادثات"
                                : o.is_historical
                                  ? "Past chat order"
                                  : "Chat order"
                              : locale === "ar"
                                ? "طلب من الموقع"
                                : "Website order"}
                          </p>
                          {o.status === "pending" && (
                            <p className="mt-2 text-sm text-ink-muted">
                              {o.payment_status === "paid"
                                ? locale === "ar"
                                  ? "تم استلام الدفع — أكّد الطلب لبدء التجهيز."
                                  : "Payment received — confirm the order to start preparing it."
                                : `${locale === "ar" ? "محجوز حتى" : "Reserved until"} ${date(o.expires_at)}`}
                            </p>
                          )}
                        </div>
                        <span className="rounded-full bg-leaf-soft px-3 py-1 font-semibold">
                          {c[o.status]}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-1 break-words">
                          <p className="font-semibold">{o.customer_name}</p>
                          <a
                            className="inline-block min-h-11 text-brand underline"
                            dir="ltr"
                            href={`tel:${o.customer_phone.replace(/[^+\d]/g, "")}`}
                          >
                            {o.customer_phone}
                          </a>
                          <p>{o.customer_address}</p>
                          <p>{o.delivery_zone}</p>
                          <p>
                            {o.payment_method === "transfer"
                              ? locale === "ar"
                                ? "تحويل يدوي"
                                : "Manual transfer"
                              : locale === "ar"
                                ? "الدفع عند الاستلام"
                                : "Cash on delivery"}
                          </p>
                        </div>
                        <div>
                          <ul className="space-y-2">
                            {o.order_items.map((i) => (
                              <li
                                className="flex items-center justify-between gap-3"
                                key={i.id}
                              >
                                <span className="flex items-center gap-3">
                                  {PRODUCTS.find((p) => p.id === i.product_id)
                                    ?.thumb && (
                                    <img
                                      alt=""
                                      className="h-12 w-12 rounded-xl object-cover"
                                      src={
                                        PRODUCTS.find(
                                          (p) => p.id === i.product_id,
                                        )!.thumb
                                      }
                                    />
                                  )}
                                  {locale === "ar" ? i.name_ar : i.name_en} ×{" "}
                                  {i.quantity}
                                </span>
                                <span className="whitespace-nowrap">
                                  {i.quantity * i.unit_price} EGP
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-3 border-t border-line pt-3 font-bold">
                            {c.subtotal}: {o.subtotal} EGP
                            <br />
                            {locale === "ar" ? "التوصيل" : "Delivery"}:{" "}
                            {o.delivery_fee ?? 0} EGP
                            <br />
                            {locale === "ar" ? "الإجمالي" : "Total"}:{" "}
                            {Number(o.subtotal) + Number(o.delivery_fee ?? 0)}{" "}
                            EGP
                          </p>
                        </div>
                      </div>
                      {o.status === "cancelled" &&
                        o.payment_status === "paid" && (
                          <p
                            role="status"
                            className="mt-4 rounded-xl bg-orange/20 p-3 text-sm"
                          >
                            {locale === "ar"
                              ? "الطلب ملغي والدفع ما زال مسجلاً كمستلم. سجّل الاسترداد بعد إعادة المبلغ فعليًا؛ الإلغاء لا يعيد المال تلقائيًا."
                              : "This order is cancelled and payment is still marked received. Record a refund after returning the money; cancellation does not refund it automatically."}
                          </p>
                        )}
                      <div className="mt-5 flex flex-wrap items-end gap-3">
                        <form
                          className="flex flex-wrap items-end gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const value = String(
                              new FormData(e.currentTarget).get("payment"),
                            );
                            if (value === o.payment_status) return;
                            void action(() =>
                              rpc("set_order_payment", {
                                p_id: o.id,
                                p_payment: value,
                              }),
                            );
                          }}
                        >
                          <label>
                            {c.payment}
                            <select
                              key={o.payment_status}
                              name="payment"
                              className={field}
                              disabled={busy}
                              defaultValue={o.payment_status}
                            >
                              {(["unpaid", "paid", "refunded"] as const)
                                .filter(
                                  (p) =>
                                    p !== "refunded" ||
                                    o.payment_status === "paid" ||
                                    o.payment_status === "refunded",
                                )
                                .map((p) => (
                                  <option key={p} value={p}>
                                    {c[p]}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <ClayButton
                            disabled={busy}
                            type="submit"
                            variant="outline"
                          >
                            {locale === "ar" ? "حفظ الدفع" : "Save payment"}
                          </ClayButton>
                        </form>
                        {o.status === "pending" && (
                          <ClayButton
                            disabled={busy}
                            onClick={() => changeStatus(o, "confirmed")}
                          >
                            {c.confirm}
                          </ClayButton>
                        )}
                        {o.status === "confirmed" && (
                          <ClayButton
                            disabled={busy}
                            onClick={() => changeStatus(o, "shipped")}
                          >
                            {c.ship}
                          </ClayButton>
                        )}
                        {o.status === "shipped" && (
                          <ClayButton
                            disabled={busy}
                            onClick={() => changeStatus(o, "delivered")}
                          >
                            {c.deliver}
                          </ClayButton>
                        )}
                        {["pending", "confirmed"].includes(o.status) && (
                          <ClayButton
                            variant="outline"
                            disabled={busy}
                            onClick={() => changeStatus(o, "cancelled")}
                          >
                            {c.cancel}
                          </ClayButton>
                        )}
                      </div>
                    </article>
                  ))}
                {orders.length === limit && (
                  <ClayButton
                    variant="outline"
                    onClick={() => setLimit((n) => n + 25)}
                  >
                    {c.more}
                  </ClayButton>
                )}
              </section>
            )}
            {tab === "meta" && <MetaHealth />}
            {tab === "finance" && <FinancePanel />}
            {tab === "settings" && <CheckoutSettings />}
            {tab === "stock" && (
              <InventoryPanel
                stock={stock}
                movements={movements}
                loading={loading}
                onRefresh={refresh}
              />
            )}
            {tab === "notifications" && (
              <section aria-label={c.notifications} className="space-y-4">
                <div className={panel}>
                  <h2 className="text-xl">{c.notifications}</h2>
                  <p className="my-3 max-w-xl text-sm text-ink-muted">
                    {c.pushHelp}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <ClayButton
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          try {
                            if (push) {
                              await disablePush();
                              setPush(false);
                              setMessage(c.pushDisabled);
                            } else {
                              await enablePush(session.user.id);
                              setPush(true);
                              setMessage(c.pushEnabled);
                            }
                          } catch (e) {
                            const code = e instanceof Error ? e.message : "";
                            setError(
                              code === "UNSUPPORTED"
                                ? c.pushUnavailable
                                : code === "DENIED"
                                  ? c.pushDenied
                                  : code === "NOT_CONFIGURED"
                                    ? c.pushSetup
                                    : c.error,
                            );
                          }
                        })
                      }
                    >
                      {push ? c.disablePush : c.enablePush}
                    </ClayButton>
                    {push && (
                      <ClayButton
                        variant="outline"
                        onClick={() =>
                          void action(async () => {
                            const reg =
                              await navigator.serviceWorker.getRegistration(
                                asset("/admin/"),
                              );
                            await reg?.showNotification("Dalia’s Corner", {
                              body: c.testSent,
                              icon: asset("/icon-192.png"),
                            });
                            setMessage(c.testSent);
                          })
                        }
                      >
                        {c.testNotification}
                      </ClayButton>
                    )}
                    <ClayButton
                      variant="outline"
                      disabled={busy || !notices.some((n) => !n.read_at)}
                      onClick={() =>
                        void action(async () => {
                          const { error } = await storeClient()
                            .from("admin_notifications")
                            .update({ read_at: new Date().toISOString() })
                            .in(
                              "id",
                              notices
                                .filter((n) => !n.read_at)
                                .map((n) => n.id),
                            );
                          if (error) throw error;
                          await refresh();
                        })
                      }
                    >
                      {c.markRead}
                    </ClayButton>
                  </div>
                </div>
                <ul className={`${panel} divide-y divide-line`}>
                  {!notices.length && <li>{c.empty}</li>}
                  {notices.map((n) => (
                    <li
                      className="flex flex-wrap justify-between gap-2 py-4"
                      key={n.id}
                    >
                      <div>
                        <p className="font-semibold">
                          {n.kind === "order" ? c.newOrder : c.low}
                          {n.product_id
                            ? ` · ${stock.find((s) => s.product_id === n.product_id)?.[locale === "ar" ? "name_ar" : "name_en"] ?? n.product_id}`
                            : ""}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {date(n.created_at)}
                        </p>
                      </div>
                      {!n.read_at && (
                        <span className="text-sm font-semibold text-brand">
                          {c.unread}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
