"use client";
import { CheckoutSettings } from "./CheckoutSettings";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Package, ShoppingBag, Bell, ArrowLeft } from "lucide-react";
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
  delivery_fee:number; delivery_zone:string; payment_method:string;
  created_at: string;
  expires_at: string;
  order_items: {
    id: number;
    name_en: string;
    name_ar: string;
    quantity: number;
    unit_price: number;
  }[];
};
type Stock = {
  product_id: string;
  name_en: string;
  name_ar: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  price: number;
};
type Notice = {
  id: number;
  kind: string;
  read_at: string | null;
  created_at: string;
  product_id: string | null;
};
type Movement = {
  id: number;
  product_id: string;
  on_hand_delta: number;
  reserved_delta: number;
  reason: string;
  created_at: string;
};
const field =
  "mt-1 min-h-[48px] w-full rounded-clay border border-line bg-surface px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
export function AdminDashboard() {
  const { locale, dir } = useLocale();
  const c = storeCopy[locale];
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [checking, setChecking] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [tab, setTab] = useState<"orders" | "stock" | "notifications">(
    "orders",
  );
  const [filter, setFilter] = useState("all");
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
    if (!STORE_CONFIGURED) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const db = storeClient();
    void db.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
        if (error) setError(c.error);
      }
    });
    const { data } = db.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [c.error]);
  useEffect(() => {
    setAdmin(false);
    setOrders([]);
    setStock([]);
    setNotices([]);
    setMovements([]);
    if (!session) {
      setChecking(false);
      return;
    }
    let active = true;
    setChecking(true);
    void storeClient()
      .rpc("is_admin")
      .then(({ data, error }) => {
        if (active) {
          setAdmin(data === true && !error);
          setChecking(false);
          if (error) setError(c.error);
        }
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, c.error]);
  const refresh = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    try {
      const db = storeClient();
      let q = db
        .from("orders")
        .select("*,order_items(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (filter !== "all") q = q.eq("status", filter);
      const results = await Promise.all([
        q,
        db.from("inventory").select("*").order("product_id"),
        db
          .from("admin_notifications")
          .select("id,kind,read_at,created_at,product_id")
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("stock_movements")
          .select(
            "id,product_id,on_hand_delta,reserved_delta,reason,created_at",
          )
          .order("id", { ascending: false })
          .limit(30),
      ]);
      if (results.some((r) => r.error)) throw new Error();
      setOrders(results[0].data as unknown as Order[]);
      setStock(results[1].data as unknown as Stock[]);
      setNotices(results[2].data as unknown as Notice[]);
      setMovements(results[3].data as unknown as Movement[]);
    } catch {
      setError(c.error);
    } finally {
      setLoading(false);
    }
  }, [admin, limit, filter, c.error]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => clearInterval(timer);
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
    } catch {
      setError(c.error);
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
      setAdmin(false);
      setSession(null);
      setPush(false);
    });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await storeClient().rpc(name, args);
    if (error) throw error;
    await refresh();
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
        ) : recovery && session ? (
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
        ) : !admin ? (
          <section className={panel}>
            <p role="alert">{c.denied}</p>
          </section>
        ) : (
          <>
            <nav aria-label={c.admin} className="flex flex-wrap gap-2">
              {(["orders", "stock", "notifications"] as const).map((key) => {
                const Icon =
                  key === "orders"
                    ? ShoppingBag
                    : key === "stock"
                      ? Package
                      : Bell;
                return (
                  <ClayButton
                    key={key}
                    variant={tab === key ? "primary" : "outline"}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                    {c[key]}
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
            {tab === "orders" && (
              <section aria-label={c.orders} className="space-y-4">
                <label className="block max-w-xs">
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
                {!loading && !orders.length && (
                  <p className={panel}>{c.empty}</p>
                )}
                {orders.map((o) => (
                  <article className={panel} key={o.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl">DC-{o.order_number}</h2>
                        <p className="mt-1 text-sm text-ink-muted">
                          {date(o.created_at)}
                        </p>
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
                        <p>{o.customer_address}</p><p>{o.delivery_zone}</p><p>{o.payment_method==="transfer"?(locale==="ar"?"تحويل يدوي":"Manual transfer"):(locale==="ar"?"الدفع عند الاستلام":"Cash on delivery")}</p>
                      </div>
                      <div>
                        <ul className="space-y-2">
                          {o.order_items.map((i) => (
                            <li
                              className="flex justify-between gap-3"
                              key={i.id}
                            >
                              <span>
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
                          {c.subtotal}: {o.subtotal} EGP<br/>{locale==="ar"?"التوصيل":"Delivery"}: {o.delivery_fee??0} EGP<br/>{locale==="ar"?"الإجمالي":"Total"}: {Number(o.subtotal)+Number(o.delivery_fee??0)} EGP
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-end gap-3">
                      <label>
                        {c.payment}
                        <select
                          className={field}
                          disabled={busy}
                          value={o.payment_status}
                          onChange={(e) =>
                            void action(() =>
                              rpc("set_order_payment", {
                                p_id: o.id,
                                p_payment: e.target.value,
                              }),
                            )
                          }
                        >
                          {(["unpaid", "paid", "refunded"] as const).map(
                            (p) => (
                              <option key={p} value={p}>
                                {c[p]}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
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
            {tab === "stock" && <CheckoutSettings />}
            {tab === "stock" && (
              <section aria-label={c.stock} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {stock.map((s) => (
                    <article className={panel} key={s.product_id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xl">
                          {locale === "ar" ? s.name_ar : s.name_en}
                        </h2>
                        {s.on_hand - s.reserved <= s.low_stock_threshold && (
                          <span className="rounded-full bg-orange/20 px-3 py-1 text-sm font-semibold">
                            {c.low}
                          </span>
                        )}
                      </div>
                      <dl className="my-4 grid grid-cols-3 gap-2">
                        {[
                          [c.onHand, s.on_hand],
                          [c.reserved, s.reserved],
                          [c.available, s.on_hand - s.reserved],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-sm text-ink-muted">{label}</dt>
                            <dd className="text-2xl font-bold">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const data = new FormData(form);
                          void action(async () => {
                            await rpc("adjust_stock", {
                              p_product: s.product_id,
                              p_delta: Number(data.get("delta")),
                              p_reason: String(data.get("reason")),
                            });
                            form.reset();
                            setMessage(c.stockSaved);
                          });
                        }}
                      >
                        <label className="block text-sm">
                          {c.adjustment}
                          <input
                            className={field}
                            type="number"
                            name="delta"
                            required
                            min={-10000}
                            max={10000}
                            step={1}
                          />
                        </label>
                        <label className="block text-sm">
                          {c.reason}
                          <input
                            className={field}
                            name="reason"
                            required
                            minLength={3}
                            maxLength={200}
                          />
                        </label>
                        <ClayButton
                          type="submit"
                          variant="outline"
                          disabled={busy}
                        >
                          {c.adjust}
                        </ClayButton>
                      </form>
                    </article>
                  ))}
                </div>
                <section className={panel}>
                  <h2 className="text-xl">{c.history}</h2>
                  <ul className="mt-3 divide-y divide-line">
                    {movements.map((m) => (
                      <li className="py-3 text-sm" key={m.id}>
                        <p className="font-semibold">
                          {stock.find((s) => s.product_id === m.product_id)?.[
                            locale === "ar" ? "name_ar" : "name_en"
                          ] ?? m.product_id}{" "}
                          · {m.reason}
                        </p>
                        <p>
                          {c.onHand}: {m.on_hand_delta > 0 ? "+" : ""}
                          {m.on_hand_delta} · {c.reserved}:{" "}
                          {m.reserved_delta > 0 ? "+" : ""}
                          {m.reserved_delta}
                        </p>
                        <p className="text-ink-muted">{date(m.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </section>
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
