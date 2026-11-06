"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShoppingBag,
  PackageCheck,
  UserRound,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { AUTH_RETURN_KEY, parseAuthReturn } from "@/lib/store/auth-return";
import {
  accountRequestScope,
  loadCustomerAccount,
} from "@/lib/store/customer-account";
import { storeClient, STORE_CONFIGURED } from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";
import { useLocale } from "@/components/providers/LocaleProvider";
import { CustomerProfile } from "./CustomerProfile";
import { customerCopy } from "@/lib/store/customer-copy";
import { MiniNav } from "@/components/sections/MiniNav";
import { ClayButton } from "@/components/ui/ClayButton";
import { InstaPayDetails } from "@/components/ui/InstaPayDetails";
import { CartDrawer } from "@/components/sections/CartDrawer";
type Order = {
  created_at?: string;
  ordered_at?: string;
  is_historical?: boolean;
  order_number: number;
  status: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  delivery_zone: string;
  payment_method: string;
  transfer_instructions?: string;
  instapay_link?: string | null;
  instapay_number?: string | null;
  items?: Item[];
  order_items?: Item[];
};
type Item = {
  name_en: string;
  name_ar: string;
  quantity: number;
  unit_price: number;
};
export function CustomerPortal() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = storeCopy[locale];
  const {
    session,
    ready,
    signIn,
    isAdmin,
    roleReady,
    roleError,
    refreshRole,
    authIssue,
    clearAuthIssue,
    clearProfile,
    refreshProfile,
  } = useCustomerAuth();
  const accountCopy = customerCopy[locale];
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [guestReady, setGuestReady] = useState(false);
  const requests = useRef(accountRequestScope());
  const [loadedIdentity, setLoadedIdentity] = useState("");
  const [loadedAdminPreview, setLoadedAdminPreview] = useState(false);
  const [guest, setGuest] = useState(""),
    [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const identity = `${session?.user.id ?? "guest"}:${guestReady}:${guest}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  // Render-time identity gating hides old data before effect cleanup runs.
  const visibleOrders = loadedIdentity === identity ? orders : [];
  const adminPreview = loadedIdentity === identity && loadedAdminPreview;
  const guestUnavailable =
    ready &&
    guestReady &&
    !loading &&
    !error &&
    (!session || adminPreview) &&
    !!guest &&
    loadedIdentity === identity &&
    visibleOrders.length === 0;
  useEffect(() => {
    if (!STORE_CONFIGURED) {
      setGuestReady(true);
      return;
    }
    const fragment = new URLSearchParams(location.hash.slice(1)).get("order");
    let guestToken = "";
    if (fragment && /^[0-9a-f-]{36}$/i.test(fragment)) {
      guestToken = fragment;
      try {
        localStorage.setItem("dc.guest.order", fragment);
        history.replaceState(null, "", location.pathname);
      } catch {
        /* Keep the private fragment for refresh when storage is blocked. */
      }
    } else {
      try {
        guestToken = localStorage.getItem("dc.guest.order") ?? "";
      } catch {}
    }
    setGuest(guestToken);
    setGuestReady(true);
  }, []);
  const refresh = useCallback(async () => {
    // Shared auth may already be ready on client navigation. Do not consume
    // the OAuth return until the private receipt has been captured locally.
    if (!STORE_CONFIGURED || !ready || !guestReady || signingOut) return;
    const request = requests.current.begin();
    const current = () =>
      request.current() && currentIdentity.current === identity;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const db = storeClient();
      const result = await loadCustomerAccount<Order>(
        !!session,
        !!guest,
        {
          isAdmin: async () => {
            const { data, error } = await db
              .rpc("is_admin")
              .abortSignal(request.signal);
            if (error || typeof data !== "boolean")
              throw error ?? Error("ADMIN_CHECK_FAILED");
            return data;
          },
          claim: async () => {
            const { error } = await db
              .rpc("claim_order", { p_token: guest })
              .abortSignal(request.signal);
            return !error;
          },
          ownOrders: async () => {
            const { data, error } = await db
              .from("orders")
              .select(
                "order_number,status,payment_status,subtotal,delivery_fee,delivery_zone,payment_method,transfer_instructions,instapay_link,instapay_number,created_at,ordered_at,is_historical,order_items(name_en,name_ar,quantity,unit_price)",
              )
              .eq("customer_id", session!.user.id)
              .order("ordered_at", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(100)
              .abortSignal(request.signal);
            if (error) throw error;
            return data as Order[];
          },
          guestOrder: async () => {
            const { data, error } = await db
              .rpc("guest_order", { p_token: guest })
              .abortSignal(request.signal);
            if (error) throw error;
            return data as Order | null;
          },
        },
        current,
      );
      if (!result || !current()) return;
      setOrders(result.orders);
      setLoadedIdentity(identity);
      setLoadedAdminPreview(result.adminPreview);
      if (!result.attached) {
        setMessage(
          ar
            ? "تعذر ربط الطلب بهذا الحساب. استخدم الحساب الأصلي إن كان مرتبطًا بالفعل."
            : "Could not attach this order. Use the original account if it is already linked.",
        );
      }
      // No awaits below: the same identity owns all storage/navigation effects.
      if (result.claimed) {
        try {
          localStorage.removeItem("dc.guest.order");
        } catch {}
        setGuest("");
        setLoadedIdentity(`${session!.user.id}:true:`);
      }
      if (session && result.attached && !result.adminPreview) {
        try {
          const destination = parseAuthReturn(
            JSON.parse(localStorage.getItem(AUTH_RETURN_KEY) ?? "null"),
          );
          localStorage.removeItem(AUTH_RETURN_KEY);
          if (
            destination &&
            (destination.path !== "/account/" || destination.checkout)
          ) {
            location.replace(
              destination.path + (destination.checkout ? "?checkout=1" : ""),
            );
          }
        } catch {
          /* Account still works when browser storage is unavailable. */
        }
      }
    } catch {
      if (current()) setError(c.error);
    } finally {
      if (current()) setLoading(false);
    }
  }, [ready, guestReady, signingOut, session, guest, identity, ar, c.error]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => {
      clearInterval(t);
      requests.current.cancel();
    };
  }, [refresh]);

  return (
    <>
      <MiniNav />
      <main className="container-page max-w-4xl space-y-6 py-8 sm:py-12">
        {authIssue && (
          <section
            role="alert"
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <p className="text-sm leading-6">{accountCopy[authIssue]}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                className="min-h-11 rounded-lg font-semibold text-brand underline"
                onClick={signIn}
              >
                {accountCopy.retrySignIn}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 text-sm text-ink-muted"
                onClick={clearAuthIssue}
              >
                {accountCopy.dismiss}
              </button>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-brand">
              Dalia’s Corner
            </p>
            <h1 className="text-3xl">
              {ar ? "حسابي وطلباتي" : "My account & orders"}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {ar
                ? "كل تفاصيل طلباتك في مكان واحد."
                : "Your orders, delivery updates and payment details in one place."}
            </p>
          </div>
          {session && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-brand disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {c.refresh}
            </button>
          )}
        </div>
        {session && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserRound
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-brand"
              />
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">
                  {ar ? "مسجل الدخول باسم" : "Signed in as"}
                </p>
                <p className="break-all text-sm font-semibold">
                  {session.user.email ?? (ar ? "حسابك" : "your account")}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-brand"
              disabled={signingOut}
              onClick={async () => {
                requests.current.cancel();
                clearProfile();
                setSigningOut(true);
                setLoadedIdentity("");
                setOrders([]);
                const logoutIdentity = currentIdentity.current;
                const { error } = await storeClient().auth.signOut();
                setSigningOut(false);
                if (
                  currentIdentity.current !== logoutIdentity &&
                  !currentIdentity.current.startsWith("guest:")
                )
                  return;
                if (error) {
                  setError(c.error);
                  void refreshProfile();
                  return;
                }
                setOrders([]);
                if (!adminPreview) {
                  setGuest("");
                  try {
                    localStorage.removeItem("dc.guest.order");
                  } catch {}
                }
              }}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {c.logout}
            </button>
          </div>
        )}
        {session && roleReady && isAdmin && (
          <a
            href="/admin/"
            className="inline-flex min-h-12 items-center rounded-xl border border-brand/30 bg-leaf-soft/50 px-4 font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {accountCopy.admin}
          </a>
        )}
        {session && roleError && (
          <p
            role="status"
            className="rounded-xl bg-canvas-sunk px-4 py-2 text-sm text-ink-muted"
          >
            {accountCopy.roleError}{" "}
            <button
              type="button"
              onClick={() => void refreshRole()}
              className="min-h-11 rounded-lg px-2 font-semibold text-brand underline"
            >
              {accountCopy.retry}
            </button>
          </p>
        )}
        {session &&
          (!guest || loadedIdentity === identity) &&
          !adminPreview && <CustomerProfile key={session.user.id} />}
        {!STORE_CONFIGURED ? (
          <p>{c.setup}</p>
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {(!ready || (loading && !visibleOrders.length)) && (
              <p role="status" className="py-6 text-sm text-ink-muted">
                {c.loading}
              </p>
            )}
            {adminPreview && (
              <section
                className="rounded-2xl border border-brand/25 bg-leaf-soft/60 p-4"
                aria-label={ar ? "معاينة المدير" : "Admin preview"}
              >
                <h2 className="text-lg">
                  {ar ? "معاينة المدير" : "Admin preview"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {ar
                    ? "عرض الرابط لا يربط الطلب بحساب المدير. شارك رابط المتابعة الخاص مع العميل ليتمكن من عرضه وحفظه في حسابه."
                    : "Viewing this link does not attach the order to your admin account. Share the private tracking link with the customer so they can view it and save it to their account."}
                </p>
                <a
                  href="/admin/"
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg font-semibold text-brand underline"
                >
                  {ar ? "إدارة الطلبات" : "Manage orders"}
                </a>
                <button
                  type="button"
                  className="ms-4 inline-flex min-h-11 items-center rounded-lg font-semibold text-brand underline"
                  onClick={() => {
                    requests.current.cancel();
                    setLoadedIdentity("");
                    setLoadedAdminPreview(false);
                    setGuest("");
                    try {
                      localStorage.removeItem("dc.guest.order");
                    } catch {}
                  }}
                >
                  {ar ? "إنهاء المعاينة" : "Exit preview"}
                </button>
              </section>
            )}
            {guest && !session && visibleOrders.length > 0 && (
              <div className="rounded-clay bg-leaf-soft p-4">
                <p>
                  {ar
                    ? "هذا رابط خاص لطلبك. احتفظ به ولا تشاركه. سجّل الدخول لحفظ الطلب في حسابك."
                    : "This is your private order link. Keep it safe. Sign in to save this order to your account."}
                </p>
                <button
                  className="block min-h-12 text-brand underline"
                  onClick={async () => {
                    const { error } = await storeClient().rpc(
                      "revoke_order_marketing",
                      { p_token: guest },
                    );
                    setMessage(
                      error
                        ? c.error
                        : ar
                          ? "تم إيقاف مشاركة بيانات الطلب مع الإعلانات"
                          : "Ad reporting disabled for this order",
                    );
                  }}
                >
                  {ar
                    ? "إيقاف مشاركة بيانات الطلب مع الإعلانات"
                    : "Stop ad reporting for this order"}
                </button>
                <a
                  className="underline text-brand"
                  href={"/order/#order=" + guest}
                >
                  {ar ? "رابط الطلب الخاص" : "Private order link"}
                </a>
              </div>
            )}
            {guestUnavailable && (
              <section
                className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-12 text-center sm:py-16"
                aria-labelledby="unavailable-order-title"
              >
                <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-leaf-soft text-brand">
                  <UserRound aria-hidden="true" className="h-7 w-7" />
                </span>
                <h2 id="unavailable-order-title" className="text-2xl">
                  {ar ? "رابط الطلب غير متاح" : "Order link unavailable"}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-ink-muted">
                  {adminPreview
                    ? ar
                      ? "قد يكون هذا الطلب مرتبطًا بحساب العميل بالفعل. يمكنك إدارته من لوحة الإدارة."
                      : "This order may already belong to a customer account. You can manage it in admin."
                    : ar
                      ? "قد يكون الطلب مرتبطًا بحساب بالفعل. سجّل الدخول بنفس الحساب لعرض تفاصيل طلبك ومتابعته."
                      : "This order may already be saved to an account. Sign in with that account to see your order details and updates."}
                </p>
                {adminPreview ? (
                  <ClayButton href="/admin/" className="mt-6 !rounded-xl">
                    {ar ? "إدارة الطلبات" : "Manage orders"}
                  </ClayButton>
                ) : (
                  <ClayButton onClick={signIn} className="mt-6 !rounded-xl">
                    {ar
                      ? "تسجيل الدخول لعرض الطلب"
                      : "Sign in to view your order"}
                  </ClayButton>
                )}
              </section>
            )}
            {visibleOrders.map((o) => (
              <article
                key={o.order_number}
                className="rounded-clay-lg border border-line bg-surface p-5 space-y-3"
              >
                <h2 className="text-xl">DC-{o.order_number}</h2>
                {(o.ordered_at || o.created_at) && (
                  <p className="text-sm text-ink-muted">
                    {ar ? "تاريخ الطلب" : "Order date"}:{" "}
                    {new Date(o.ordered_at ?? o.created_at!).toLocaleDateString(
                      ar ? "ar-EG" : "en-GB",
                      { timeZone: "Africa/Cairo", dateStyle: "medium" },
                    )}
                  </p>
                )}
                {session && !adminPreview && (
                  <button
                    className="min-h-12 text-brand underline"
                    onClick={async () => {
                      const { error } = await storeClient().rpc(
                        "revoke_customer_marketing",
                        { p_number: o.order_number },
                      );
                      setMessage(
                        error
                          ? c.error
                          : ar
                            ? "تم إيقاف مشاركة بيانات الطلب"
                            : "Order ad reporting disabled",
                      );
                    }}
                  >
                    {ar
                      ? "إيقاف مشاركة بيانات الطلب مع الإعلانات"
                      : "Stop ad reporting for this order"}
                  </button>
                )}
                <p>
                  {(c as Record<string, string>)[o.status] ?? o.status} ·{" "}
                  {(c as Record<string, string>)[o.payment_status] ??
                    o.payment_status}
                </p>
                <ul>
                  {(o.items ?? o.order_items ?? []).map((i, n) => (
                    <li key={n}>
                      {ar ? i.name_ar : i.name_en} × {i.quantity} —{" "}
                      {i.unit_price * i.quantity} EGP
                    </li>
                  ))}
                </ul>
                <p>
                  {ar ? "التوصيل" : "Delivery"}: {o.delivery_zone} ·{" "}
                  {o.delivery_fee} EGP
                </p>
                <p className="font-bold">
                  {ar ? "الإجمالي" : "Total"}:{" "}
                  {Number(o.subtotal) + Number(o.delivery_fee)} EGP
                </p>
                <p>
                  {o.payment_method === "cash"
                    ? ar
                      ? "الدفع عند الاستلام"
                      : "Cash on delivery"
                    : ar
                      ? "إنستا باي — يؤكد المتجر استلام المبلغ"
                      : "InstaPay — payment is confirmed by the shop"}
                </p>
                {o.payment_method === "transfer" &&
                  o.payment_status === "unpaid" &&
                  ["pending", "confirmed"].includes(o.status) && (
                    <InstaPayDetails details={o} legacy />
                  )}
              </article>
            ))}
            {ready &&
              !loading &&
              !error &&
              loadedIdentity === identity &&
              (!guest || (!!session && !adminPreview)) &&
              visibleOrders.length === 0 && (
                <section className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-12 text-center sm:py-16">
                  <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-leaf-soft text-brand">
                    <ShoppingBag aria-hidden="true" className="h-7 w-7" />
                  </span>
                  <h2 className="text-2xl">
                    {ar ? "لا توجد طلبات بعد" : "Your first order starts here"}
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-ink-muted">
                    {ar
                      ? "ستظهر طلباتك هنا بمجرد تأكيدها من المتجر. اختر شيئًا مميزًا من مجموعتنا."
                      : "Once you place an order, you can follow its progress here. Find something special in our collection."}
                  </p>
                  <ClayButton href="/#characters" className="mt-6 !rounded-xl">
                    {ar ? "تصفح المجموعة" : "Explore the collection"}
                  </ClayButton>
                </section>
              )}
            {ready &&
              !session &&
              !guestUnavailable &&
              (!guest || visibleOrders.length > 0) && (
                <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-leaf-soft/60 p-5">
                  <div className="flex items-start gap-3">
                    <PackageCheck
                      aria-hidden="true"
                      className="mt-1 h-5 w-5 shrink-0 text-brand"
                    />
                    <div>
                      <h2 className="font-display text-lg font-semibold">
                        {ar
                          ? "احفظ طلباتك في حساب واحد"
                          : "Keep your orders together"}
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {ar
                          ? "تسجيل الدخول اختياري، ويمكنك المتابعة كضيف."
                          : "Sign in or create an account. Guest checkout is always available."}
                      </p>
                    </div>
                  </div>
                  <ClayButton
                    onClick={signIn}
                    variant="outline"
                    className="!rounded-xl"
                  >
                    {ar ? "تسجيل الدخول" : "Sign in / create account"}
                  </ClayButton>
                </section>
              )}

            <p className="text-sm">
              <a href="/privacy/" className="underline">
                {ar
                  ? "الخصوصية وطلب حذف الحساب"
                  : "Privacy and account deletion requests"}
              </a>
            </p>
          </>
        )}
      </main>
      <CartDrawer />
    </>
  );
}
