"use client";
import Script from "next/script";
import { createPortal } from "react-dom";
import { Banknote, Landmark, ShieldCheck, UserRound, Info } from "lucide-react";
import { receiptExpired } from "@/lib/store/order-receipt";
import { checkoutIssue } from "@/lib/store/checkout-readiness";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { checkoutCopy, checkoutFieldClass } from "@/lib/store/checkout-copy";
import {
  checkoutAttemptForOwner,
  restoreOwnedCheckoutAttempt,
  checkoutRequestScope,
  type OwnedCheckoutAttempt,
} from "@/lib/store/checkout-identity";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useInventory } from "@/components/providers/InventoryProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "./ClayButton";
import { useConsent } from "@/components/providers/ConsentProvider";
import {
  storeClient,
  STORE_CONFIGURED,
  type SavedOrder,
} from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";
import { parseOrder } from "@/lib/store/validation";
import type { Customer } from "@/lib/whatsapp";
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
  footerTarget,
  children,
}: {
  customer: Customer;
  canCheckout: boolean;
  visible: boolean;
  footerTarget?: HTMLElement | null;
  children?: React.ReactNode;
}) {
  const { lines, clear, subtotal } = useCart();
  const { consent } = useConsent();
  const [zones, setZones] = useState<
    { id: string; name_en: string; name_ar: string; fee: number }[]
  >([]);
  const {
    session,
    signIn,
    ready: authReady,
    profile,
    profileReady,
  } = useCustomerAuth();
  const zoneOwner = session?.user.id ?? "guest";
  const currentZoneOwner = useRef(zoneOwner);
  currentZoneOwner.current = zoneOwner;
  const [zoneDraft, setZoneDraft] = useState({
    owner: zoneOwner,
    value: "",
    touched: false,
  });
  const zone = zoneDraft.owner === zoneOwner ? zoneDraft.value : "";
  const [payment, setPayment] = useState("cash");
  const [settings, setSettings] = useState({
    cash_enabled: false,
    transfer_enabled: false,
    transfer_instructions: "",
  });
  const [configStatus, setConfigStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const signedIn = !!session;
  const loadOptions = useCallback(async () => {
    if (!STORE_CONFIGURED) return;
    setConfigStatus("loading");
    try {
      const [z, s] = await Promise.all([
        storeClient().from("delivery_zones").select("*").eq("active", true),
        storeClient().from("checkout_settings").select("*").single(),
      ]);
      if (z.error || s.error || !s.data) throw Error();
      setZones(z.data ?? []);
      setZoneDraft((current) => {
        const owner = currentZoneOwner.current;
        return current.owner === owner
          ? {
              ...current,
              value: z.data?.some((item) => item.id === current.value)
                ? current.value
                : "",
            }
          : { owner, value: "", touched: false };
      });
      setSettings(s.data);
      setPayment((current) =>
        current === "cash" && s.data.cash_enabled
          ? "cash"
          : current === "transfer" &&
              s.data.transfer_enabled &&
              s.data.transfer_instructions.trim()
            ? "transfer"
            : s.data.cash_enabled
              ? "cash"
              : "transfer",
      );
      setConfigStatus("ready");
    } catch {
      setConfigStatus("error");
    }
  }, []);
  useEffect(() => {
    if (visible) void loadOptions();
  }, [visible, loadOptions]);
  useEffect(() => {
    setZoneDraft((current) =>
      current.owner === zoneOwner
        ? current
        : { owner: zoneOwner, value: "", touched: false },
    );
  }, [zoneOwner]);
  useEffect(() => {
    if (
      !authReady ||
      !profileReady ||
      !session ||
      profile?.user_id !== session.user.id ||
      !profile.completed_at ||
      configStatus !== "ready"
    )
      return;
    setZoneDraft((current) =>
      current.owner !== zoneOwner || current.touched
        ? current
        : {
            ...current,
            value: zones.some((item) => item.id === profile.delivery_zone_id)
              ? profile.delivery_zone_id!
              : "",
          },
    );
  }, [
    authReady,
    profileReady,
    profile,
    session?.user.id,
    zoneOwner,
    configStatus,
    zones,
  ]);
  const { locale, messages } = useLocale();
  const { refresh } = useInventory();
  const c = storeCopy[locale];
  const ui = checkoutCopy[locale];
  const selectedZone = zones.find((z) => z.id === zone);
  const paymentAvailable =
    payment === "cash"
      ? settings.cash_enabled
      : settings.transfer_enabled && !!settings.transfer_instructions.trim();
  const verificationAvailable =
    configStatus === "ready" && zones.length > 0 && paymentAvailable;

  const [tokenState, setTokenState] = useState({ owner: zoneOwner, value: "" });
  const token = tokenState.owner === zoneOwner ? tokenState.value : "";
  const setToken = useCallback(
    (value: string) => {
      if (currentZoneOwner.current === zoneOwner)
        setTokenState({ owner: zoneOwner, value });
    },
    [zoneOwner],
  );
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [busyState, setBusyState] = useState({
    owner: zoneOwner,
    value: false,
  });
  const busy = busyState.owner === zoneOwner && busyState.value;
  const setBusy = useCallback(
    (value: boolean) => {
      if (currentZoneOwner.current === zoneOwner)
        setBusyState({ owner: zoneOwner, value });
    },
    [zoneOwner],
  );
  const [errorState, setErrorState] = useState({ owner: zoneOwner, value: "" });
  const error = errorState.owner === zoneOwner ? errorState.value : "";
  const setError = useCallback(
    (value: string) => {
      if (currentZoneOwner.current === zoneOwner)
        setErrorState({ owner: zoneOwner, value });
    },
    [zoneOwner],
  );
  const [savedState, setSaved] = useState<{
    owner: string;
    order: SavedOrder;
    href: string;
  } | null>(null);
  const saved =
    authReady && savedState?.owner === zoneOwner ? savedState : null;
  const [scriptReady, setScriptReady] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();
  const submissions = useRef(checkoutRequestScope());
  const receipt = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<OwnedCheckoutAttempt | null>(null);
  useEffect(() => {
    if (!authReady) return;
    submissions.current.invalidateOwner(zoneOwner);
    setBusyState((current) =>
      current.owner === zoneOwner
        ? current
        : { owner: zoneOwner, value: false },
    );
    setErrorState((current) =>
      current.owner === zoneOwner ? current : { owner: zoneOwner, value: "" },
    );
    setSaved((current) => (current?.owner === zoneOwner ? current : null));
    setVerificationRequested(false);
    attempt.current = checkoutAttemptForOwner(attempt.current, zoneOwner);
    try {
      const persisted = checkoutAttemptForOwner(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
        zoneOwner,
      );
      if (persisted)
        localStorage.setItem(storageKey, JSON.stringify(persisted));
      else localStorage.removeItem(storageKey);
    } catch {}
  }, [zoneOwner, authReady]);
  useEffect(() => () => submissions.current.cancel(), []);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (
      !visible ||
      !verificationAvailable ||
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
      theme: "light",
      appearance: verificationRequested ? "always" : "interaction-only",
      language: locale,
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
  }, [
    visible,
    zoneOwner,
    setToken,
    setError,
    verificationRequested,
    verificationAvailable,
    scriptReady,
    siteKey,
    saved,
    c.verification,
    locale,
  ]);
  useEffect(() => {
    if (saved) receipt.current?.focus();
  }, [saved]);
  const submit = useCallback(async () => {
    if (submissions.current.busy(zoneOwner) || !authReady || !visible) return;
    const issue = checkoutIssue(customer, selectedZone?.id ?? "");
    if (issue) {
      setError(ui[`${issue}Required`]);
      const field = document.getElementById(
        issue === "zone" ? "checkout-zone" : `cart-${issue}`,
      );
      field?.focus();
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!token) {
      setVerificationRequested(true);
      setError(ui.verificationRequired);
      widget.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const request = submissions.current.begin(zoneOwner);
    const current = () => request.current(currentZoneOwner.current);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setBusy(true);
    setError("");
    try {
      const session = (await storeClient().auth.getSession()).data.session;
      if (!current()) return;
      if ((session?.user.id ?? "guest") !== zoneOwner)
        throw Error("SIGN_IN_AGAIN");
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
          }),
        ),
      );
      if (!current()) return;
      const fingerprint = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      let persisted: unknown = null;
      try {
        persisted = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      } catch {}
      const nextAttempt = restoreOwnedCheckoutAttempt(
        attempt.current,
        persisted,
        fingerprint,
        zoneOwner,
        () => crypto.randomUUID(),
      );
      const { key, orderToken } = nextAttempt;
      attempt.current = nextAttempt;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...attempt.current, orderToken }),
        );
      } catch {}
      if (!current()) return;
      timeout = setTimeout(request.abort, 25000);
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
          signal: request.signal,
        },
      );
      if (!current()) return;
      const result = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(result.error);
      const order = result as SavedOrder;
      if (receiptExpired(order)) throw new Error("ORDER_EXPIRED");
      try {
        localStorage.setItem("dc.guest.order", orderToken);
      } catch {
        /* Receipt link remains usable without storage. */
      }
      setSaved({
        owner: zoneOwner,
        order,
        href: "/order/#order=" + orderToken,
      });
      // Submitted-order Lead is sent once by the server; Purchase waits for paid status.
      void refresh();
    } catch (e) {
      if (!current()) return;
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "ORDER_NOT_AVAILABLE"
          ? locale === "ar"
            ? "سجّل الدخول بالحساب المرتبط بهذا الطلب للمتابعة."
            : "Sign in with the account linked to this order to continue."
          : code === "OUT_OF_STOCK"
            ? c.stockError
            : code === "VERIFICATION_REQUIRED"
              ? c.verification
              : code === "IDEMPOTENCY_CONFLICT"
                ? c.conflict
                : code === "ORDER_EXPIRED"
                  ? c.expiredOrder
                  : code === "INVALID_ORDER"
                    ? messages.cart.detailsRequired
                    : code === "SIGN_IN_AGAIN"
                      ? ui.signInAgain
                      : code === "INVALID_DELIVERY" ||
                          code === "INVALID_PAYMENT"
                        ? ui.optionsChanged
                        : c.saveError,
      );
    } finally {
      clearTimeout(timeout);
      if (request.finish(currentZoneOwner.current)) {
        setBusy(false);
        setToken("");
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
      }
    }
  }, [
    authReady,
    visible,
    zoneOwner,
    setBusy,
    setError,
    setToken,
    selectedZone,
    ui,
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
  if (!STORE_CONFIGURED)
    return (
      <p role="status" className="text-sm text-ink-muted">
        {ui.unavailable}
      </p>
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
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt>{ui.subtotal}</dt>
            <dd>{saved.order.subtotal} EGP</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{ui.deliveryFee}</dt>
            <dd>{saved.order.delivery_fee} EGP</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-brand/20 pt-2 font-bold">
            <dt>{ui.total}</dt>
            <dd>{saved.order.total} EGP</dd>
          </div>
        </dl>
        <p className="text-sm">
          {saved.order.payment_method === "transfer" ? ui.transfer : ui.cash}
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
              localStorage.removeItem(storageKey);
            } catch {}
          }}
        >
          {c.newOrderAction}
        </ClayButton>
      </div>
    );
  const unavailable =
    configStatus === "ready" && (!zones.length || !paymentAvailable);
  const footer = (
    <div className="space-y-3">
      <dl className="space-y-1 text-sm text-ink-muted">
        <div className="flex justify-between gap-3">
          <dt>{ui.subtotal}</dt>
          <dd className="tabular">
            {subtotal} {messages.cart.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{ui.deliveryFee}</dt>
          <dd className="tabular">
            {selectedZone
              ? `${selectedZone.fee} ${messages.cart.currency}`
              : ui.chooseFirst}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="font-display text-lg font-bold">{ui.total}</span>
        <span className="tabular font-display text-xl font-bold text-brand">
          {selectedZone
            ? `${subtotal + Number(selectedZone.fee)} ${messages.cart.currency}`
            : "—"}
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
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
        disabled={
          !authReady ||
          busy ||
          !siteKey ||
          !zones.length ||
          !paymentAvailable ||
          configStatus !== "ready"
        }
        onClick={() => void submit()}
        className="w-full !rounded-xl"
        variant="primary"
      >
        {busy ? c.saving : unavailable ? ui.unavailableButton : c.submit}
      </ClayButton>
      {error === ui.verificationRequired || error === c.verification ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-lg text-sm font-semibold text-brand underline"
          onClick={() => {
            setVerificationRequested(true);
            if (!scriptReady) {
              location.reload();
              return;
            }
            if (widgetId.current) window.turnstile?.reset(widgetId.current);
            widget.current?.scrollIntoView({
              block: "center",
              behavior: "smooth",
            });
          }}
        >
          {ui.retryVerification}
        </button>
      ) : null}
      <p
        className="flex items-center justify-center gap-1.5 text-xs text-ink-muted"
        role="status"
      >
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
        {verificationAvailable && canCheckout && !token
          ? ui.checking
          : ui.secure}
      </p>
    </div>
  );
  return (
    <div className="space-y-6 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas-sunk px-3.5 py-1 text-sm">
        <span className="flex items-center gap-2 text-ink-muted">
          <UserRound aria-hidden="true" className="h-4 w-4" />
          {signedIn ? ui.signedIn : ui.guest}
        </span>
        {signedIn ? (
          <a
            href="/account/"
            className="inline-flex min-h-11 items-center font-semibold text-brand underline"
          >
            {messages.nav.account}
          </a>
        ) : (
          <button
            type="button"
            onClick={signIn}
            className="inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {ui.signIn}
          </button>
        )}
      </div>
      {children}
      <fieldset className="space-y-3 border-0 p-0">
        <legend className="font-display text-lg font-semibold">
          {ui.delivery}
        </legend>
        <label
          htmlFor="checkout-zone"
          className="block text-sm font-semibold text-ink-muted"
        >
          {ui.area}
        </label>
        <div className="relative !mt-1.5">
          <select
            id="checkout-zone"
            disabled={!authReady || configStatus !== "ready" || !zones.length}
            aria-describedby={
              configStatus === "error" ||
              (configStatus === "ready" && !zones.length)
                ? "checkout-delivery-message"
                : undefined
            }
            className={checkoutFieldClass}
            value={zone}
            onChange={(e) => {
              setZoneDraft({
                owner: zoneOwner,
                value: e.target.value,
                touched: true,
              });
              setError("");
            }}
          >
            <option value="">
              {configStatus === "loading" ? ui.loading : ui.chooseArea}
            </option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {locale === "ar" ? z.name_ar : z.name_en} · {z.fee}{" "}
                {messages.cart.currency}
              </option>
            ))}
          </select>
        </div>
        {configStatus === "error" ? (
          <div
            id="checkout-delivery-message"
            role="status"
            className="rounded-xl bg-clay-soft/50 px-3 py-2 text-sm text-ink-muted"
          >
            {ui.loadError}{" "}
            <button
              className="min-h-11 rounded-lg font-semibold text-brand underline"
              onClick={() => void loadOptions()}
            >
              {ui.retry}
            </button>
          </div>
        ) : configStatus === "ready" && !zones.length ? (
          <p
            id="checkout-delivery-message"
            role="status"
            className="flex gap-2 rounded-xl bg-clay-soft/50 px-3 py-3 text-sm leading-relaxed text-ink-muted"
          >
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {ui.unavailable}
          </p>
        ) : null}
      </fieldset>
      <fieldset className="border-0 p-0">
        <legend className="mb-3 font-display text-lg font-semibold">
          {ui.payment}
        </legend>
        <div className="grid gap-2">
          {[
            {
              id: "cash",
              enabled: settings.cash_enabled,
              label: ui.cash,
              hint: ui.cashHint,
              Icon: Banknote,
            },
            {
              id: "transfer",
              enabled:
                settings.transfer_enabled &&
                !!settings.transfer_instructions.trim(),
              label: ui.transfer,
              hint: ui.transferHint,
              Icon: Landmark,
            },
          ]
            .filter((method) => method.enabled)
            .map(({ id, label, hint, Icon }) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-brand/30 ${payment === id ? "border-brand/60 bg-leaf-soft/50" : "border-line bg-surface"}`}
              >
                <input
                  type="radio"
                  name="checkout-payment"
                  value={id}
                  checked={payment === id}
                  onChange={() => setPayment(id)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <Icon
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-brand"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {label}
                  </span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
        </div>
        {configStatus === "ready" &&
          !settings.cash_enabled &&
          !(
            settings.transfer_enabled && settings.transfer_instructions.trim()
          ) && <p className="text-sm text-ink-muted">{ui.noPayment}</p>}
        {payment === "transfer" && settings.transfer_instructions && (
          <details className="mt-3 rounded-xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold text-brand">
              {ui.transferDetails}
            </summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">
              {settings.transfer_instructions}
            </p>
          </details>
        )}
      </fieldset>
      <p className="text-xs leading-relaxed text-ink-muted">{ui.hold}</p>
      {visible && siteKey && verificationAvailable && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            onError={() => setError(c.verification)}
          />
          <div ref={widget} />
        </>
      )}
      {!siteKey && (
        <p role="status" className="text-sm text-ink-muted">
          {ui.unavailable}
        </p>
      )}
      {footerTarget ? createPortal(footer, footerTarget) : footer}
    </div>
  );
}
