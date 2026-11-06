"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useInventory } from "@/components/providers/InventoryProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "./ClayButton";
import { WhatsAppIcon } from "./BrandIcons";
import { STORE_CONFIGURED, type SavedOrder } from "@/lib/store/client";
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
  const { lines, clear } = useCart();
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
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
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
      const key =
        previous?.fingerprint === fingerprint ? previous.key : canonical.key;
      attempt.current = { fingerprint, key };
      try {
        localStorage.setItem(storageKey, JSON.stringify(attempt.current));
      } catch {}
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          },
          body: JSON.stringify({ ...canonical, key, turnstileToken: token }),
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
      const message = [
        messages.whatsapp.greeting,
        `${c.orderNumber}: DC-${order.order_number}`,
        ...order.items.map(
          (i) =>
            `${locale === "ar" ? i.name_ar : i.name_en} × ${i.qty} — ${i.price * i.qty} EGP`,
        ),
        `${c.subtotal}: ${order.subtotal} EGP`,
        `${messages.whatsapp.name}: ${canonical.customer.name}`,
        `${messages.whatsapp.phone}: ${canonical.customer.phone}`,
        `${messages.whatsapp.address}: ${canonical.customer.address}`,
        messages.whatsapp.closing,
      ].join("\n");
      setSaved({ order, href: whatsappLink(message) });
      void trackCheckoutLead(lines, customer);
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
  }, [canCheckout, token, customer, lines, locale, messages, c, refresh]);
  if (!STORE_CONFIGURED)
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-muted">{c.setupCheckout}</p>
        <ClayButton
          href={
            canCheckout
              ? buildOrderLink(lines, locale, messages, customer)
              : whatsappLink()
          }
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          className="w-full"
          onClick={() => {
            if (canCheckout) void trackCheckoutLead(lines, customer);
          }}
        >
          <WhatsAppIcon className="h-5 w-5" />
          {c.contact}
        </ClayButton>
      </div>
    );
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
          target="_blank"
          rel="noopener noreferrer"
          className="w-full"
        >
          {c.openWhatsapp}
        </ClayButton>
        <ClayButton
          variant="outline"
          onClick={() => {
            clear();
            setSaved(null);
            attempt.current = null;
            try {
              localStorage.removeItem(storageKey);
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
              localStorage.removeItem(storageKey);
            } catch {}
            setError("");
          }}
        >
          {c.newOrderAction}
        </ClayButton>
      )}
      <ClayButton
        disabled={!canCheckout || busy || !token || !siteKey}
        onClick={() => void submit()}
        className="w-full"
        variant="whatsapp"
      >
        <WhatsAppIcon className="h-5 w-5" />
        {busy ? c.saving : c.submit}
      </ClayButton>
    </div>
  );
}
