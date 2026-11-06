"use client";
import Script from "next/script";
import {
  checkoutAttempt,
  type CheckoutAttempt,
} from "@/lib/store/checkout-attempt";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useInventory } from "@/components/providers/InventoryProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "./ClayButton";
import { WhatsAppIcon } from "./BrandIcons";
import { useConsent } from "@/components/providers/ConsentProvider";
import {
  storeClient,
  STORE_CONFIGURED,
  type SavedOrder,
} from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";
import { parseOrder } from "@/lib/store/validation";
import { buildOrderLink, type Customer } from "@/lib/whatsapp";
import { whatsappLink } from "@/lib/config";
import { trackCheckoutLead } from "@/lib/meta";
type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
const storageKey = "dalias-corner.checkout-attempt";
export function StoreCheckout({
  customer,
  canCheckout,
  visible,
}: {
  customer: Customer;
  canCheckout: boolean;
  visible: boolean;
}) {
  const { lines, clear, subtotal } = useCart();
  const { consent } = useConsent();
  const [zones, setZones] = useState<
    { id: string; name_en: string; name_ar: string; fee: number }[]
  >([]);
  const [zone, setZone] = useState("");
  const [payment, setPayment] = useState("cash");
  const [settings, setSettings] = useState({
    cash_enabled: false,
    transfer_enabled: false,
    transfer_instructions: "",
  });
  useEffect(() => {
    if (!STORE_CONFIGURED) return;
    void Promise.all([
      storeClient().from("delivery_zones").select("*").eq("active", true),
      storeClient().from("checkout_settings").select("*").single(),
    ]).then(([z, s]) => {
      if (z.data) setZones(z.data);
      if (s.data) {
        setSettings(s.data);
        setPayment(s.data.cash_enabled ? "cash" : "transfer");
      }
    });
  }, []);
  const { locale, messages } = useLocale();
  const { refresh } = useInventory();
  const c = storeCopy[locale];
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{
    order: SavedOrder;
    href: string;
  } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();
  const guard = useRef(false);
  const receipt = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<CheckoutAttempt | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (
      !visible ||
      !scriptReady ||
      !siteKey ||
      !widget.current ||
      !window.turnstile ||
      saved
    )
      return;
    const id = window.turnstile.render(widget.current, {
      sitekey: siteKey,
      action: "checkout",
      size: "flexible",
      callback: (value: string) => setToken(value),
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setError(c.verification);
      },
    });
    widgetId.current = id;
    return () => {
      window.turnstile?.remove(id);
      widgetId.current = undefined;
      setToken("");
    };
  }, [visible, scriptReady, siteKey, saved, c.verification]);
  useEffect(() => {
    if (saved) receipt.current?.focus();
  }, [saved]);
  const submit = useCallback(async () => {
    if (guard.current || !canCheckout) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (!token) throw new Error("VERIFICATION_REQUIRED");
      const session = (await storeClient().auth.getSession()).data.session;
      const canonical = parseOrder({
        key: crypto.randomUUID(),
        customer,
        lines,
        locale,
      });
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify({
            customer: canonical.customer,
            lines: canonical.lines,
            locale,
            zone,
            payment,
            user: session?.user.id,
          }),
        ),
      );
      const fingerprint = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      let previous = attempt.current;
      try {
        previous =
          JSON.parse(localStorage.getItem(storageKey) ?? "null") ?? previous;
      } catch {}
      const nextAttempt = checkoutAttempt(previous, fingerprint, () =>
        crypto.randomUUID(),
      );
      const { key, orderToken } = nextAttempt;
      attempt.current = nextAttempt;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...attempt.current, orderToken }),
        );
      } catch {}
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/place-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            ...(session
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            ...canonical,
            key,
            orderToken,
            zone,
            payment,
            marketingConsent: consent === "granted",
            ...(consent === "granted"
              ? Object.fromEntries(
                  document.cookie
                    .split("; ")
                    .filter(
                      (v) => v.startsWith("_fbp=") || v.startsWith("_fbc="),
                    )
                    .map((v) => [
                      v.slice(1, v.indexOf("=")),
                      v.slice(v.indexOf("=") + 1),
                    ]),
                )
              : {}),
            turnstileToken: token,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const order = result as SavedOrder;
      if (
        ["expired", "cancelled"].includes(order.status) ||
        (order.status === "pending" &&
          Date.parse(order.expires_at) <= Date.now())
      )
        throw new Error("ORDER_EXPIRED");
      try {
        localStorage.setItem("dc.guest.order", orderToken);
      } catch {
        /* Receipt link remains usable without storage. */
      }
      setSaved({ order, href: "/order/#order=" + orderToken });
      // Submitted-order Lead is sent once by the server; Purchase waits for paid status.
      void refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "OUT_OF_STOCK"
          ? c.stockError
          : code === "VERIFICATION_REQUIRED"
            ? c.verification
            : code === "IDEMPOTENCY_CONFLICT"
              ? c.conflict
              : code === "ORDER_EXPIRED"
                ? c.expiredOrder
                : code === "INVALID_ORDER"
                  ? messages.cart.detailsRequired
                  : c.saveError,
      );
    } finally {
      setBusy(false);
      guard.current = false;
      setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  }, [
    canCheckout,
    token,
    customer,
    lines,
    locale,
    messages,
    c,
    refresh,
    zone,
    payment,
    consent,
  ]);
  if (!STORE_CONFIGURED) return <p role="alert">{c.setupCheckout}</p>;
  if (saved)
    return (
      <div className="space-y-3 rounded-clay bg-leaf-soft p-4" role="status">
        <h3 ref={receipt} tabIndex={-1} className="font-bold">
          {c.orderSaved} · DC-{saved.order.order_number}
        </h3>
        <p className="text-sm">{c.savedNotice}</p>
        <ul className="text-sm">
          {saved.order.items.map((i) => (
            <li key={i.id}>
              {locale === "ar" ? i.name_ar : i.name_en} × {i.qty} —{" "}
              {i.qty * i.price} EGP
            </li>
          ))}
        </ul>
        <p className="font-bold">
          {c.subtotal}: {saved.order.subtotal} EGP
        </p>
        <ClayButton
          href={saved.href}
          onClick={() => {
            clear();
            try {
              localStorage.removeItem(storageKey);
            } catch {}
          }}
          className="w-full"
        >
          {locale === "ar"
            ? "عرض طلبي وإنشاء حساب"
            : "View my order & create an account"}
        </ClayButton>
        <ClayButton
          variant="outline"
          onClick={() => {
            clear();
            setSaved(null);
            attempt.current = null;
            try {
              try {
                localStorage.removeItem(storageKey);
              } catch {}
            } catch {}
          }}
        >
          {c.newOrderAction}
        </ClayButton>
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-muted">{c.notice}</p>
      <a href="/account/" className="text-brand underline">
        {locale === "ar"
          ? "تسجيل الدخول أو إنشاء حساب (اختياري)"
          : "Sign in or create an account (optional)"}
      </a>
      <label className="block">
        {locale === "ar" ? "منطقة التوصيل" : "Delivery zone"}
        <select
          className="w-full min-h-12 rounded-clay border border-line bg-surface"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="">
            {locale === "ar" ? "اختر المنطقة" : "Choose a zone"}
          </option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {locale === "ar" ? z.name_ar : z.name_en} — {z.fee} EGP
            </option>
          ))}
        </select>
      </label>
      {!zones.length && (
        <p>
          {locale === "ar"
            ? "الطلبات غير متاحة حتى يتم تحديد مناطق التوصيل."
            : "Ordering is unavailable until delivery zones are configured."}
        </p>
      )}
      <label className="block">
        {locale === "ar" ? "طريقة الدفع" : "Payment method"}
        <select
          className="w-full min-h-12 rounded-clay border border-line bg-surface"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          {settings.cash_enabled && (
            <option value="cash">
              {locale === "ar" ? "الدفع عند الاستلام" : "Cash on delivery"}
            </option>
          )}
          {settings.transfer_enabled &&
            settings.transfer_instructions.trim() && (
              <option value="transfer">
                {locale === "ar" ? "تحويل يدوي" : "Manual transfer"}
              </option>
            )}
        </select>
      </label>
      {payment === "transfer" && (
        <p className="whitespace-pre-wrap text-sm">
          {settings.transfer_instructions}
        </p>
      )}
      <p className="font-bold">
        {locale === "ar" ? "الإجمالي مع التوصيل" : "Total including delivery"}:{" "}
        {subtotal + Number(zones.find((z) => z.id === zone)?.fee ?? 0)} EGP
      </p>
      {visible && siteKey && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            onError={() => setError(c.verification)}
          />
          <div ref={widget} className="min-h-[65px]" />
        </>
      )}
      {!siteKey && (
        <p role="alert" className="text-sm">
          {c.setupCheckout}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
      {error === c.expiredOrder && (
        <ClayButton
          variant="outline"
          onClick={() => {
            attempt.current = null;
            try {
              try {
                localStorage.removeItem(storageKey);
              } catch {}
            } catch {}
            setError("");
          }}
        >
          {c.newOrderAction}
        </ClayButton>
      )}
      <ClayButton
        disabled={
          !canCheckout ||
          busy ||
          !token ||
          !siteKey ||
          !zone ||
          !(payment === "cash"
            ? settings.cash_enabled
            : settings.transfer_enabled &&
              settings.transfer_instructions.trim())
        }
        onClick={() => void submit()}
        className="w-full"
        variant="whatsapp"
      >
        {busy ? c.saving : c.submit}
      </ClayButton>
    </div>
  );
}
