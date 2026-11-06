"use client";
import { NotificationsPanel, type AdminNotice } from "./NotificationsPanel";
import { AdminDialog } from "./AdminDialog";
import { AdminOrderMessages } from "./AdminOrderMessages";
import { MetaHealth } from "./MetaHealth";
import { FinancePanel } from "./FinancePanel";
import { ExpensesPanel } from "./ExpensesPanel";
import { AdminWorkspace, type AdminSection } from "./AdminWorkspace";
import { AdminRefreshButton } from "./AdminRefreshButton";
import { CheckoutSettings } from "./CheckoutSettings";
import { InventoryPanel, type Stock, type Movement } from "./InventoryPanel";
import { ManualOrderForm } from "./ManualOrderForm";
import { OrderAdjustments } from "./order-adjustments/OrderAdjustments";
import { PRODUCTS } from "@/lib/products";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { accountRequestScope } from "@/lib/store/customer-account";
import { ArrowLeft, Plus, ChevronRight } from "lucide-react";
import { ClayButton } from "@/components/ui/ClayButton";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeCopy } from "@/lib/store/copy";
import { STORE_CONFIGURED, storeClient } from "@/lib/store/client";
import { enablePush, disablePush } from "@/lib/store/push";
import { asset } from "@/lib/asset";
import {
  orderItemProgress,
  orderProgressState,
  progressStateLabel,
  type ProgressItem,
} from "@/lib/store/order-progress";

type Status =
  "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "expired";
type Order = {
  id: string;
  order_number: number;
  status: Status;
  payment_status: "unpaid" | "paid" | "refunded";
  payment_state?: string;
  ops_managed?: boolean;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  locale?: "en" | "ar";
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
  order_items: (ProgressItem & {
    id: number;
    product_id: string;
    name_en: string;
    name_ar: string;
    quantity: number;
    unit_price: number;
  })[];
};
type Notice = AdminNotice;
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
  const [tab, setTab] = useState<AdminSection>("orders");
  const [refreshKeys, setRefreshKeys] = useState<Record<AdminSection, number>>({
    orders: 0,
    stock: 0,
    expenses: 0,
    finance: 0,
    settings: 0,
    notifications: 0,
    meta: 0,
  });
  const [expensesVisited, setExpensesVisited] = useState(false);
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("all");
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderSort, setOrderSort] = useState<
    "newest" | "oldest" | "total_desc" | "total_asc" | "customer"
  >("newest");
  const sortLabels =
    locale === "ar"
      ? {
          newest: "الأحدث تسجيلًا",
          oldest: "الأقدم تسجيلًا",
          total_desc: "الإجمالي: الأعلى أولًا",
          total_asc: "الإجمالي: الأقل أولًا",
          customer: "اسم العميل: أ–ي",
        }
      : {
          newest: "Newest recorded",
          oldest: "Oldest recorded",
          total_desc: "Total: high to low",
          total_asc: "Total: low to high",
          customer: "Customer: A–Z",
        };
  const [limit, setLimit] = useState(25);
  const [orders, setOrders] = useState<Order[]>([]);
  const [listedOrderIds, setListedOrderIds] = useState<string[]>([]);
  // A selected order can be fetched separately from the current query page.
  const listedOrders = orders.filter((order) =>
    listedOrderIds.includes(order.id),
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrderRef = useRef<string | null>(null);
  selectedOrderRef.current = selectedOrderId;
  const noticeRequests = useRef(accountRequestScope());
  const [stockFocus, setStockFocus] = useState<string | undefined>();
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
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
    noticeRequests.current.cancel();
    setStockFocus(undefined);
    setOrders([]);
    setListedOrderIds([]);
    setSelectedOrderId(null);
    setStock([]);
    setNotices([]);
    setMovements([]);
    setShowManualOrder(false);
    setPush(false);
    setBusy(false);
    setExpensesVisited(false);
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
      let q = db.from("orders").select("*,order_items(*)");
      if (orderSort === "customer")
        q = q
          .order("customer_name", { ascending: true })
          .order("created_at", { ascending: false });
      else if (orderSort === "total_asc" || orderSort === "total_desc")
        q = q
          .order("order_total", { ascending: orderSort === "total_asc" })
          .order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: orderSort === "oldest" });
      q = q.order("id", { ascending: orderSort === "oldest" }).limit(limit);
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
          .select(
            "id,kind,read_at,created_at,product_id,order_id,orders(order_number)",
          )
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
        selectedOrderRef.current
          ? db
              .from("orders")
              .select("*,order_items(*)")
              .eq("id", selectedOrderRef.current)
              .abortSignal(request.signal)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!current()) return;
      if (results.some((r) => r.error)) throw new Error();
      const nextOrders = results[0].data as unknown as Order[];
      const detailOrder = results[4].data as unknown as Order | null;
      setListedOrderIds(nextOrders.map((order) => order.id));
      setOrders(
        detailOrder && !nextOrders.some((o) => o.id === detailOrder.id)
          ? [...nextOrders, detailOrder]
          : nextOrders,
      );
      setStock(results[1].data as unknown as Stock[]);
      setNotices(results[2].data as unknown as Notice[]);
      setMovements(results[3].data as unknown as Movement[]);
    } catch {
      if (current()) setError(c.error);
    } finally {
      if (current()) setLoading(false);
    }
  }, [
    admin,
    session?.user.id,
    refreshRole,
    limit,
    filter,
    source,
    orderSort,
    c.error,
  ]);
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
  async function openNoticeOrder(id: string) {
    if (!admin || !session) return;
    const userId = session.user.id;
    const request = noticeRequests.current.begin();
    const current = () => request.current() && viewer.current === userId;
    try {
      const allowed = await refreshRole();
      if (!current() || !allowed) return;
      const { data, error } = await storeClient()
        .from("orders")
        .select("*,order_items(*)")
        .eq("id", id)
        .abortSignal(request.signal)
        .maybeSingle();
      if (!current()) return;
      if (error || !data) {
        setError(
          locale === "ar"
            ? "تعذر فتح هذا الطلب. حدّث القائمة وحاول مجددًا."
            : "This order is unavailable. Refresh the list and try again.",
        );
        return;
      }
      setOrders((previous) => [
        ...previous.filter((o) => o.id !== id),
        data as unknown as Order,
      ]);
      setFilter("all");
      setSource("all");
      setOrderSearch("");
      setSelectedOrderId(id);
      setTab("orders");
    } catch {
      if (current()) setError(c.error);
    }
  }
  useEffect(() => () => noticeRequests.current.cancel(), []);
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
  return (
    <main dir={dir} className="admin-ui min-h-screen bg-canvas pb-12 text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
      <div className="mx-auto max-w-7xl space-y-4 px-4 pt-5 sm:px-6">
        {!admin && (
          <div>
            <p className="text-sm font-semibold text-brand">Dalia’s Corner</p>
            <h1 className="mt-1 text-3xl sm:text-4xl">{c.admin}</h1>
            <p className="mt-2 text-ink-muted">{c.subtitle}</p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-clay border border-clay bg-clay-soft p-4"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="rounded-xl bg-leaf-soft px-3 py-2 text-sm"
          >
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
          <AdminWorkspace
            section={tab}
            onSectionChange={(section) => {
              if (section === "expenses") {
                setExpensesVisited(true);
                if (tab !== section)
                  setRefreshKeys((keys) => ({
                    ...keys,
                    expenses: keys.expenses + 1,
                  }));
              }
              setTab(section);
            }}
            unreadCount={notices.filter((n) => !n.read_at).length}
            refreshControl={
              <AdminRefreshButton
                loading={
                  ["orders", "stock", "notifications"].includes(tab) && loading
                }
                disabled={busy}
                onClick={() => {
                  if (["orders", "stock", "notifications"].includes(tab))
                    void refresh();
                  else
                    setRefreshKeys((keys) => ({
                      ...keys,
                      [tab]: keys[tab] + 1,
                    }));
                }}
              />
            }
          >
            <ManualOrderForm
              key={session.user.id}
              open={showManualOrder && tab === "orders"}
              actorId={session.user.id}
              stock={stock}
              onSaved={refresh}
              onCancel={() => setShowManualOrder(false)}
              onViewOrder={(number) => {
                setFilter("all");
                setSource("all");
                setOrderSearch(`DC-${number}`);
                const createdOrder = orders.find(
                  (o) => o.order_number === number,
                );
                if (createdOrder) setSelectedOrderId(createdOrder.id);
                setLimit(25);
                setShowManualOrder(false);
              }}
            />
            {tab === "orders" && (
              <section aria-label={c.orders} className="space-y-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
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
                <div className="grid gap-x-3 gap-y-2 min-[480px]:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                  <label className="block min-w-0 text-xs font-medium text-ink-muted">
                    {locale === "ar"
                      ? "البحث في الطلبات المحملة"
                      : "Search loaded orders"}
                    <input
                      className={field}
                      style={{ height: 44, minHeight: 44, paddingBlock: 8 }}
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
                  <label className="block min-w-0 text-xs font-medium text-ink-muted">
                    {c.orders}
                    <select
                      className={field}
                      style={{ height: 44, minHeight: 44, paddingBlock: 8 }}
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
                  <label className="block min-w-0 text-xs font-medium text-ink-muted">
                    {locale === "ar" ? "مصدر الطلب" : "Order source"}
                    <select
                      className={field}
                      style={{ height: 44, minHeight: 44, paddingBlock: 8 }}
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
                  <label className="block min-w-0 text-xs font-medium text-ink-muted">
                    {locale === "ar" ? "ترتيب حسب" : "Sort by"}
                    <select
                      className={field}
                      style={{ height: 44, minHeight: 44, paddingBlock: 8 }}
                      value={orderSort}
                      onChange={(event) => {
                        setOrderSort(event.target.value as typeof orderSort);
                        setLimit(25);
                      }}
                    >
                      {(
                        Object.keys(sortLabels) as (keyof typeof sortLabels)[]
                      ).map((value) => (
                        <option key={value} value={value}>
                          {sortLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-sm text-ink-muted" role="status">
                  {loading
                    ? c.loading
                    : `${listedOrders.length} ${locale === "ar" ? "طلبات محملة" : "orders loaded"} · ${sortLabels[orderSort]}`}
                </p>
                {!loading && !listedOrders.length && (
                  <p className={panel}>{c.empty}</p>
                )}
                {!loading &&
                  listedOrders.length > 0 &&
                  !listedOrders.some((o) =>
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
                <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div
                    className="hidden grid-cols-[1.25fr_1.5fr_1.1fr_1fr_auto] gap-4 border-b border-line bg-canvas-sunk px-4 py-2 text-xs font-semibold text-ink-muted lg:grid"
                    aria-hidden="true"
                  >
                    <span>
                      {locale === "ar" ? "الطلب والمنتجات" : "Order & products"}
                    </span>
                    <span>
                      {locale === "ar"
                        ? "العميل والتوصيل"
                        : "Customer & delivery"}
                    </span>
                    <span>
                      {locale === "ar"
                        ? "حالة الطلب والدفع"
                        : "Order & payment status"}
                    </span>
                    <span className="text-end">
                      {locale === "ar" ? "الإجمالي" : "Total"}
                    </span>
                    <span />
                  </div>
                  <ul className="divide-y divide-line">
                    {listedOrders
                      .filter((o) =>
                        `DC-${o.order_number} ${o.customer_name} ${o.customer_phone}`
                          .toLowerCase()
                          .includes(orderSearch.trim().toLowerCase()),
                      )
                      .map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setError("");
                              setMessage("");
                            }}
                            aria-label={`${locale === "ar" ? "عرض الطلب" : "View order"} DC-${o.order_number} — ${o.customer_name}`}
                            aria-describedby={`order-status-${o.id} order-total-${o.id}`}
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-s-4 border-brand/30 px-4 py-4 text-start text-sm transition-colors hover:bg-leaf-soft/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/40 lg:grid-cols-[1.25fr_1.5fr_1.1fr_1fr_auto]"
                          >
                            <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                              <span className="flex shrink-0 -space-x-3 rtl:space-x-reverse">
                                {o.order_items
                                  .filter(
                                    (item) =>
                                      orderItemProgress(item).billable > 0,
                                  )
                                  .slice(0, 3)
                                  .map((item) => {
                                    const product = PRODUCTS.find(
                                      (p) => p.id === item.product_id,
                                    );
                                    return product?.thumb ? (
                                      <img
                                        key={item.id}
                                        src={product.thumb}
                                        alt=""
                                        className="h-11 w-11 rounded-xl border-2 border-surface object-cover"
                                      />
                                    ) : null;
                                  })}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-display text-base font-bold text-brand">
                                  DC-{o.order_number}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-muted">
                                  {date(o.ordered_at ?? o.created_at)}
                                </span>
                                <span className="mt-1 block text-xs text-ink-muted">
                                  {o.source === "chat"
                                    ? locale === "ar"
                                      ? "محادثات"
                                      : "Chat"
                                    : locale === "ar"
                                      ? "الموقع"
                                      : "Website"}
                                  {o.is_historical
                                    ? locale === "ar"
                                      ? " · سابق"
                                      : " · Past"
                                    : ""}{" "}
                                  ·{" "}
                                  {o.order_items.reduce(
                                    (sum, item) =>
                                      sum + orderItemProgress(item).billable,
                                    0,
                                  )}{" "}
                                  {locale === "ar" ? "قطع" : "pieces"}
                                </span>
                              </span>
                            </span>
                            <span className="col-span-2 min-w-0 border-t border-line/60 pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
                              <span className="mb-1 block text-[11px] text-ink-muted lg:sr-only">
                                {locale === "ar" ? "إلى" : "Deliver to"}
                              </span>
                              <span className="block break-words font-semibold">
                                {o.customer_name}
                              </span>
                              <span
                                dir="ltr"
                                className="mt-0.5 inline-block text-xs text-ink-muted"
                              >
                                {o.customer_phone}
                              </span>
                              {o.delivery_zone && (
                                <span className="mt-0.5 block break-words text-xs text-ink-muted">
                                  {o.delivery_zone}
                                </span>
                              )}
                            </span>
                            <span
                              id={`order-status-${o.id}`}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${["cancelled", "expired"].includes(o.status) ? "bg-orange/20 text-ink" : "bg-leaf-soft text-brand"}`}
                              >
                                {progressStateLabel(
                                  orderProgressState(o.order_items, o.status),
                                  locale === "ar",
                                ) ?? c[o.status]}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-1 text-xs ${o.payment_status === "paid" ? "border-brand/20 bg-brand/5 text-brand" : "border-line text-ink-muted"}`}
                              >
                                {o.payment_state === "partial"
                                  ? locale === "ar"
                                    ? "مدفوع جزئيًا"
                                    : "Partially paid"
                                  : o.payment_state === "overpaid"
                                    ? locale === "ar"
                                      ? "رصيد زائد"
                                      : "Overpaid"
                                    : c[o.payment_status]}
                              </span>
                            </span>
                            <span
                              id={`order-total-${o.id}`}
                              className="text-end"
                            >
                              <span className="block font-display text-base font-bold tabular-nums">
                                {Number(o.subtotal) +
                                  Number(o.delivery_fee ?? 0)}{" "}
                                EGP
                              </span>
                              <span className="mt-1 block text-[11px] text-ink-muted">
                                {locale === "ar"
                                  ? "شامل التوصيل"
                                  : "Including delivery"}
                              </span>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className="hidden h-4 w-4 text-brand rtl:rotate-180 lg:block"
                            />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
                {listedOrders.length === limit && (
                  <ClayButton
                    variant="outline"
                    onClick={() => setLimit((n) => n + 25)}
                  >
                    {c.more}
                  </ClayButton>
                )}
              </section>
            )}
            {selectedOrder && tab === "orders" && (
              <AdminDialog
                open
                title={`DC-${selectedOrder.order_number}`}
                variant="drawer"
                busy={busy}
                onClose={() => setSelectedOrderId(null)}
              >
                {error && (
                  <p
                    role="alert"
                    className="mb-4 rounded-xl bg-orange/15 p-3 text-sm"
                  >
                    {error}
                  </p>
                )}
                {message && (
                  <p
                    role="status"
                    className="mb-4 rounded-xl bg-leaf-soft p-3 text-sm"
                  >
                    {message}
                  </p>
                )}
                {[selectedOrder].map((o) => (
                  <article className="space-y-4" key={o.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="mt-1 text-sm text-ink-muted">
                          <span className="font-semibold">
                            {locale === "ar" ? "تاريخ الطلب: " : "Order date: "}
                          </span>
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
                        {progressStateLabel(
                          orderProgressState(o.order_items, o.status),
                          locale === "ar",
                        ) ?? c[o.status]}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <section
                        aria-label={locale === "ar" ? "العميل" : "Customer"}
                        className="rounded-xl border border-line bg-surface p-4"
                      >
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {locale === "ar" ? "العميل" : "Customer"}
                        </h3>
                        <p className="break-words font-semibold">
                          {o.customer_name}
                        </p>
                        <a
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4"
                          dir="ltr"
                          href={`tel:${o.customer_phone.replace(/[^+\d]/g, "")}`}
                        >
                          {o.customer_phone}
                        </a>
                      </section>
                      <section
                        aria-label={locale === "ar" ? "التوصيل" : "Delivery"}
                        className="rounded-xl border border-line bg-canvas/60 p-4"
                      >
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {locale === "ar"
                            ? "عنوان التوصيل"
                            : "Delivery address"}
                        </h3>
                        <p className="break-words text-sm leading-6">
                          {o.customer_address}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-brand">
                          {o.delivery_zone}
                        </p>
                      </section>
                    </div>
                    <section
                      aria-label={locale === "ar" ? "المنتجات" : "Items"}
                      className="overflow-hidden rounded-xl border border-line"
                    >
                      <h3 className="border-b border-line bg-canvas-sunk px-4 py-2 text-sm font-semibold">
                        {locale === "ar" ? "المنتجات" : "Items"}
                      </h3>
                      <ul className="divide-y divide-line">
                        {o.order_items.map((i) => {
                          const progress = orderItemProgress(i);
                          const product = PRODUCTS.find(
                            (p) => p.id === i.product_id,
                          );
                          return (
                            <li
                              className="flex min-w-0 items-center gap-3 px-4 py-3"
                              key={i.id}
                            >
                              {product?.thumb && (
                                <img
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                                  src={product.thumb}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-semibold">
                                  {locale === "ar" ? i.name_ar : i.name_en}
                                </p>
                                <p className="mt-1 text-xs text-ink-muted">
                                  {locale === "ar" ? "الكمية" : "Qty"}:{" "}
                                  {progress.billable} · {i.unit_price} EGP{" "}
                                  {locale === "ar" ? "للقطعة" : "each"}
                                </p>
                                {(progress.shipped > 0 ||
                                  progress.removed > 0 ||
                                  progress.returned > 0) && (
                                  <p className="mt-1 text-xs text-ink-muted">
                                    {locale === "ar" ? "شُحن" : "Shipped"}:{" "}
                                    {progress.shipped} ·{" "}
                                    {locale === "ar" ? "متبقي" : "Remaining"}:{" "}
                                    {progress.remaining} ·{" "}
                                    {locale === "ar" ? "أزيل" : "Removed"}:{" "}
                                    {progress.removed} ·{" "}
                                    {locale === "ar" ? "مرتجع" : "Returned"}:{" "}
                                    {progress.returned}
                                  </p>
                                )}
                              </div>
                              <strong className="shrink-0 text-sm tabular-nums">
                                {progress.billable * i.unit_price} EGP
                              </strong>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                    <section
                      aria-label={
                        locale === "ar" ? "ملخص المبلغ" : "Order total"
                      }
                      className="rounded-xl border border-brand/15 bg-leaf-soft/45 p-4"
                    >
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-ink-muted">{c.subtotal}</dt>
                          <dd className="font-semibold tabular-nums">
                            {o.subtotal} EGP
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-ink-muted">
                            {locale === "ar" ? "رسوم التوصيل" : "Delivery fee"}
                          </dt>
                          <dd className="font-semibold tabular-nums">
                            {o.delivery_fee ?? 0} EGP
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-brand/15 pt-2 text-base font-bold">
                          <dt>
                            {locale === "ar" ? "إجمالي الطلب" : "Order total"}
                          </dt>
                          <dd className="tabular-nums">
                            {Number(o.subtotal) + Number(o.delivery_fee ?? 0)}{" "}
                            EGP
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
                      <span className="text-ink-muted">
                        {locale === "ar" ? "طريقة الدفع" : "Payment method"}
                      </span>
                      <span className="font-semibold">
                        {o.payment_method === "transfer"
                          ? locale === "ar"
                            ? "إنستا باي"
                            : "InstaPay"
                          : locale === "ar"
                            ? "الدفع عند الاستلام"
                            : "Cash on delivery"}
                      </span>
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
                    <OrderAdjustments
                      orderId={o.id}
                      onSaved={refresh}
                      onBusyChange={setBusy}
                    />
                    <AdminOrderMessages
                      orderId={o.id}
                      orderNumber={o.order_number}
                      phone={o.customer_phone}
                      locale={o.locale}
                      status={o.status}
                      busy={busy}
                    />
                  </article>
                ))}
              </AdminDialog>
            )}
            {tab === "meta" && (
              <MetaHealth refreshKey={refreshKeys.meta} hideRefresh />
            )}
            {tab === "finance" && (
              <FinancePanel refreshKey={refreshKeys.finance} hideRefresh />
            )}
            {expensesVisited && (
              <div hidden={tab !== "expenses"}>
                <ExpensesPanel refreshKey={refreshKeys.expenses} hideRefresh />
              </div>
            )}
            {tab === "settings" && (
              <CheckoutSettings refreshKey={refreshKeys.settings} />
            )}
            {tab === "stock" && (
              <InventoryPanel
                stock={stock}
                initialProduct={stockFocus}
                movements={movements}
                loading={loading}
                onRefresh={refresh}
              />
            )}
            {tab === "notifications" && (
              <NotificationsPanel
                notices={notices}
                push={push}
                stock={stock}
                orders={orders}
                onOpenOrder={(id) => void openNoticeOrder(id)}
                onOpenProduct={(id) => {
                  setStockFocus(id);
                  setTab("stock");
                }}
                actions={
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
                }
              />
            )}
          </AdminWorkspace>
        )}
      </div>
    </main>
  );
}
