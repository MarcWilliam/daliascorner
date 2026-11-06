"use client";
import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { storeClient, STORE_CONFIGURED } from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";
import { useLocale } from "@/components/providers/LocaleProvider";
import { MiniNav } from "@/components/sections/MiniNav";
import { ClayButton } from "@/components/ui/ClayButton";
import { CartDrawer } from "@/components/sections/CartDrawer";
type Order = {
  order_number: number;
  status: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  delivery_zone: string;
  payment_method: string;
  transfer_instructions?: string;
  items?: Item[];
  order_items?: Item[];
};
type Item = {
  name_en: string;
  name_ar: string;
  quantity: number;
  unit_price: number;
};
const input =
  "mt-1 w-full min-h-12 rounded-clay border border-line bg-surface px-4 focus-visible:ring-4 focus-visible:ring-brand/45";
export function CustomerPortal() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = storeCopy[locale];
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [guest, setGuest] = useState(""),
    [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [recover, setRecover] = useState(false);
  useEffect(() => {
    if (!STORE_CONFIGURED) {
      setReady(true);
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
    const db = storeClient();
    void db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    if (!STORE_CONFIGURED || !ready) return;
    setError("");
    try {
      const db = storeClient();
      if (session) {
        if (guest) {
          const result = await db.rpc("claim_order", { p_token: guest });
          if (!result.error) {
            try {
              localStorage.removeItem("dc.guest.order");
            } catch {}
            setGuest("");
          } else {
            setMessage(
              ar
                ? "تعذر ربط الطلب بهذا الحساب. استخدم الحساب الأصلي إن كان مرتبطًا بالفعل."
                : "Could not attach this order. Use the original account if it is already linked.",
            );
          }
        }
        const { data, error } = await db
          .from("orders")
          .select(
            "order_number,status,payment_status,subtotal,delivery_fee,delivery_zone,payment_method,transfer_instructions,order_items(name_en,name_ar,quantity,unit_price)",
          )
          .eq("customer_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        setOrders(data as Order[]);
      } else if (guest) {
        const { data, error } = await db.rpc("guest_order", { p_token: guest });
        if (error) throw error;
        setOrders(data ? [data] : []);
        if (!data)
          setMessage(
            ar
              ? "الطلب غير متاح بهذا الرابط. سجّل الدخول إذا أضفته لحسابك."
              : "This link is unavailable. Sign in if you attached this order to your account.",
          );
      } else setOrders([]);
    } catch {
      setError(c.error);
    }
  }, [ready, session, guest, ar, c.error]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => clearInterval(t);
  }, [refresh]);
  async function social(provider: "google" | "facebook") {
    setBusy(true);
    setError("");
    const { error } = await storeClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: location.origin + "/account/",
        ...(provider === "facebook" ? { scopes: "email" } : {}),
      },
    });
    if (error) {
      setError(c.error);
      setBusy(false);
    }
  }

  return (
    <>
      <MiniNav />
      <main className="container-page py-10 space-y-6">
        <h1 className="text-3xl">
          {ar ? "حسابي وطلباتي" : "My account & orders"}
        </h1>
        {session && <p className="text-sm text-ink-muted">{ar ? "مسجل الدخول باسم" : "Signed in as"}: {session.user.email ?? (ar ? "حسابك" : "your account")}</p>}
        {!STORE_CONFIGURED ? (
          <p>{c.setup}</p>
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {!ready && <p>{c.loading}</p>}
            {guest && !session && (
              <div className="rounded-clay bg-leaf-soft p-4">
                <p>
                  {ar
                    ? "هذا رابط خاص لطلبك. احتفظ به ولا تشاركه. يمكنك إنشاء حساب وربط الطلب بعد تأكيد البريد."
                    : "This is your private order link. Keep it safe. Create an account to attach the order after confirming your email."}
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
            {orders.map((o) => (
              <article
                key={o.order_number}
                className="rounded-clay-lg border border-line bg-surface p-5 space-y-3"
              >
                <h2 className="text-xl">DC-{o.order_number}</h2>
                {session && (
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
                      ? "تحويل يدوي — نراجع وصول المبلغ قبل تأكيد الدفع"
                      : "Manual transfer — payment is verified by our team"}
                </p>
                {o.payment_method === "transfer" &&
                  o.payment_status === "unpaid" &&
                  ["pending", "confirmed"].includes(o.status) && (
                    <p className="whitespace-pre-wrap">
                      {o.transfer_instructions}
                    </p>
                  )}
              </article>
            ))}
            {session && !recover ? (
              <div className="flex gap-3">
                <ClayButton variant="outline" onClick={() => void refresh()}>
                  {c.refresh}
                </ClayButton>
                <ClayButton
                  variant="outline"
                  onClick={async () => {
                    await storeClient().auth.signOut();
                    setOrders([]);
                    setGuest("");
                    try {
                      localStorage.removeItem("dc.guest.order");
                    } catch {}
                  }}
                >
                  {c.logout}
                </ClayButton>
              </div>
            ) : (
              ready && (
                <section className="max-w-md rounded-clay-lg border border-line bg-surface p-5 space-y-4">
                  <h2 className="text-xl">
                    {ar
                      ? "تسجيل الدخول أو إنشاء حساب"
                      : "Sign in or create an account"}
                  </h2>
                  <p>
                    {ar
                      ? "تابع بحسابك لحفظ الطلبات ومتابعتها."
                      : "Continue with your account to save and track your orders."}
                  </p>
                  {process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true" && (
                    <ClayButton
                      className="w-full"
                      disabled={busy}
                      onClick={() => void social("google")}
                    >
                      {ar ? "المتابعة باستخدام Google" : "Continue with Google"}
                    </ClayButton>
                  )}
                  {process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED ===
                    "true" && (
                    <ClayButton
                      className="w-full"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void social("facebook")}
                    >
                      {ar
                        ? "المتابعة باستخدام Facebook"
                        : "Continue with Facebook"}
                    </ClayButton>
                  )}
                  {process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED !== "true" &&
                    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED !==
                      "true" && (
                      <p>
                        {ar
                          ? "تسجيل الدخول الاجتماعي قيد الإعداد. يمكنك الطلب كضيف والاحتفاظ برابط الطلب."
                          : "Social sign-in is being configured. You can order as a guest and keep your private order link."}
                      </p>
                    )}
                </section>
              )
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
