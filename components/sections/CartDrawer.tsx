"use client";

import { useSaleActive } from "@/components/providers/PromotionProvider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { getProduct, getProductName } from "@/lib/products";
import { type Customer } from "@/lib/whatsapp";
import { StoreCheckout } from "@/components/ui/StoreCheckout";
import { checkoutFieldClass } from "@/lib/store/checkout-copy";
import { ClayButton } from "@/components/ui/ClayButton";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import {
  applyProfileDelivery,
  deliveryDraftKey,
  deliveryEdits,
  emptyCustomer,
  readDeliveryDraft,
  restoreDeliveryDraft,
  untouchedDelivery,
  type DeliveryTouched,
} from "@/lib/store/checkout-profile";

export function CartDrawer() {
  const active = useSaleActive();
  const { lines, count, isOpen, open, close, increment, decrement, remove } =
    useCart();
  const { t, locale, dir, messages } = useLocale();
  const announce = useAnnouncer();

  const {
    session,
    ready: authReady,
    profile,
    profileReady,
  } = useCustomerAuth();
  const scope = session ? `user:${session.user.id}` : "guest";
  const previousScope = useRef<string | null>(null);
  const resumedCheckout = useRef(false);
  const [draft, setDraft] = useState<{
    scope: string | null;
    customer: Customer;
    touched: DeliveryTouched;
    loaded: boolean;
  }>({
    scope: null,
    customer: emptyCustomer(),
    touched: untouchedDelivery(),
    loaded: false,
  });
  const customer =
    authReady && draft.scope === scope ? draft.customer : emptyCustomer();
  const loaded = authReady && draft.scope === scope && draft.loaded;
  const [checkoutFooter, setCheckoutFooter] = useState<HTMLDivElement | null>(
    null,
  );

  // Resume the same saved basket after social sign-in's allowlisted callback.
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("checkout") !== "1") return;
    resumedCheckout.current = true;
    url.searchParams.delete("checkout");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    open();
  }, [open]);

  // Delivery drafts are account-scoped. Unowned legacy data must not appear in another account.
  useEffect(() => {
    if (!authReady) return;
    let restored = readDeliveryDraft(null);
    try {
      if (
        previousScope.current?.startsWith("user:") &&
        previousScope.current !== scope
      )
        localStorage.removeItem(deliveryDraftKey(previousScope.current));
      restored = restoreDeliveryDraft(
        scope,
        location.pathname,
        resumedCheckout.current ? "?checkout=1" : location.search,
        localStorage,
        sessionStorage,
      );
    } catch {
      /* Missing or blocked storage must not prevent checkout. */
    }
    previousScope.current = scope;
    setDraft((current) =>
      current.scope === scope && current.loaded
        ? current
        : { scope, ...restored, loaded: true },
    );
  }, [authReady, scope, session?.user.id]);

  useEffect(() => {
    if (
      !loaded ||
      !profileReady ||
      !session ||
      profile?.user_id !== session.user.id
    )
      return;
    setDraft((current) =>
      current.scope === scope
        ? {
            ...current,
            customer: applyProfileDelivery(
              current.customer,
              current.touched,
              profile,
              session.user.id,
            ),
          }
        : current,
    );
  }, [loaded, profileReady, profile, session?.user.id, scope]);

  // Persist details so returning customers don't retype them. Gated on `loaded`
  // so the initial empty default never overwrites saved details before the load
  // effect restores them (mirrors CartProvider's `hydrated` gate).
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        deliveryDraftKey(scope),
        JSON.stringify(deliveryEdits(draft.customer, draft.touched)),
      );
    } catch {
      /* ignore */
    }
  }, [draft, loaded, scope]);

  const updateField =
    (key: keyof Customer) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({
        scope,
        loaded: true,
        customer: {
          ...(current.scope === scope ? current.customer : emptyCustomer()),
          [key]: e.target.value,
        },
        touched: {
          ...(current.scope === scope ? current.touched : untouchedDelivery()),
          [key]: true,
        },
      }));

  const detailsComplete =
    customer.name.trim() !== "" &&
    customer.phone.trim() !== "" &&
    customer.address.trim() !== "";
  const canCheckout = lines.length > 0 && detailsComplete;

  // Total saved vs. original prices (for the discount line in the summary).
  const savings = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const p = getProduct(l.id, active);
        if (p?.price == null || p.originalPrice == null) return sum;
        return sum + Math.max(0, p.originalPrice - p.price) * l.qty;
      }, 0),
    [lines, active],
  );

  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // Lock body scroll + remember the trigger while open.
  useEffect(() => {
    if (isOpen) {
      lastFocused.current = document.activeElement as HTMLElement;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Move focus into the drawer.
      const id = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
      return () => {
        document.body.style.overflow = prev;
        window.clearTimeout(id);
      };
    }
  }, [isOpen]);

  // ESC to close + focus trap.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => {
        if (
          el.tabIndex < 0 ||
          !el.getClientRects().length ||
          el.getBoundingClientRect().height === 0
        )
          return false;
        if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
          const group = Array.from(
            panel.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
          ).filter((r) => r.name === el.name && !r.disabled);
          return el === (group.find((r) => r.checked) ?? group[0]);
        }
        return true;
      });
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  // Return focus to the trigger after close.
  useEffect(() => {
    if (!isOpen && lastFocused.current) {
      lastFocused.current.focus?.();
      lastFocused.current = null;
    }
  }, [isOpen]);

  // A closed drawer must leave the tab order entirely — aria-hidden alone keeps
  // its controls keyboard-focusable. `inert` isn't typed in React 18, so toggle
  // it imperatively on the wrapper.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (isOpen) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [isOpen]);

  // Off-screen slide direction follows the inline-end side (mirrors in RTL).
  const offClass = isOpen
    ? "translate-x-0"
    : dir === "rtl"
      ? "-translate-x-full"
      : "translate-x-full";

  return (
    <div
      ref={wrapperRef}
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-[100] ${isOpen ? "" : "pointer-events-none"}`}
    >
      {/* Scrim (≈50% black) */}
      <div
        onClick={close}
        className={`absolute inset-0 bg-ink/55 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel pinned to the inline-end side */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("cart.title")}
        onKeyDown={onKeyDown}
        className={`absolute inset-y-0 end-0 flex h-full w-[min(30rem,100%)] flex-col border-s border-line bg-canvas shadow-clay-lg transition-transform duration-300 ease-out ${offClass}`}
      >
        {/* header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5 text-brand" aria-hidden="true" />
            {t("cart.title")}
            {count > 0 && (
              <span className="tabular rounded-full bg-orange px-2 py-0.5 text-sm font-bold text-ink">
                {count}
              </span>
            )}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label={t("cart.close")}
            className="grid h-11 w-11 place-items-center rounded-clay border border-line bg-surface text-ink shadow-clay-sm transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* One scroll region keeps the products and checkout reachable. */}
          {lines.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-blob bg-canvas-sunk">
                <ShoppingBag
                  className="h-9 w-9 text-ink-muted"
                  aria-hidden="true"
                />
              </span>
              <p className="text-lg text-ink-muted">{t("cart.empty")}</p>
              <ClayButton
                href="#characters"
                variant="primary"
                onClick={close as never}
              >
                {t("cart.emptyCta")}
              </ClayButton>
            </div>
          ) : (
            <ul className="space-y-3 px-5 py-5">
              {lines.map((line) => {
                const product = getProduct(line.id, active);
                if (!product) return null;
                const name = getProductName(product, locale);
                return (
                  <li
                    key={line.id}
                    className="flex gap-3 border-b border-line/70 pb-4 last:border-0 last:pb-0"
                  >
                    <img
                      src={product.thumb}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-clay object-cover"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display font-semibold text-ink">
                          {name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            remove(line.id);
                            announce(t("cart.removed", { name }));
                          }}
                          aria-label={`${t("cart.remove")} — ${name}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-clay text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40 [touch-action:manipulation] cursor-pointer"
                        >
                          <Trash2
                            className="h-[1.15rem] w-[1.15rem]"
                            aria-hidden="true"
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {/* quantity stepper */}
                        <div
                          className="inline-flex items-center rounded-clay border border-line bg-canvas"
                          role="group"
                          aria-label={`${t("cart.quantity")} — ${name}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              announce(
                                line.qty <= 1
                                  ? t("cart.removed", { name })
                                  : `${name} — ${t("cart.quantity")}: ${line.qty - 1}`,
                              );
                              decrement(line.id);
                            }}
                            aria-label={t("cart.decrease")}
                            className="grid h-11 w-11 place-items-center rounded-clay text-ink transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <span className="tabular min-w-[2ch] text-center font-display font-bold text-ink">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              announce(
                                `${name} — ${t("cart.quantity")}: ${line.qty + 1}`,
                              );
                              increment(line.id);
                            }}
                            aria-label={t("cart.increase")}
                            className="grid h-11 w-11 place-items-center rounded-clay text-ink transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        {/* optional per-item price */}
                        {product.price != null && (
                          <span className="tabular font-display font-bold text-brand">
                            {product.price * line.qty} {messages.cart.currency}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <div className="px-5 pb-6">
              {savings > 0 && (
                <p className="mb-4 text-sm font-semibold text-brand">
                  {t("cart.savings")}: {savings} {messages.cart.currency}
                </p>
              )}
              <StoreCheckout
                customer={customer}
                canCheckout={canCheckout}
                visible={isOpen}
                footerTarget={checkoutFooter}
              >
                <fieldset className="space-y-3 border-0 p-0" disabled={!loaded}>
                  <legend className="font-display text-lg font-semibold text-ink">
                    {t("cart.detailsTitle")}
                  </legend>
                  {session &&
                    profile?.user_id === session.user.id &&
                    profile.completed_at && (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg text-sm font-semibold text-brand underline"
                        onClick={() =>
                          setDraft({
                            scope,
                            loaded: true,
                            customer: applyProfileDelivery(
                              emptyCustomer(),
                              untouchedDelivery(),
                              profile,
                              session.user.id,
                            ),
                            touched: untouchedDelivery(),
                          })
                        }
                      >
                        {locale === "ar"
                          ? "استخدام بياناتي المحفوظة"
                          : "Use my saved details"}
                      </button>
                    )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label
                      htmlFor="cart-name"
                      className="block text-sm font-semibold text-ink-muted"
                    >
                      {t("cart.name")}
                      <input
                        id="cart-name"
                        type="text"
                        autoComplete="name"
                        value={customer.name}
                        onChange={updateField("name")}
                        placeholder={t("cart.namePlaceholder")}
                        className={`${checkoutFieldClass} mt-1.5`}
                      />
                    </label>
                    <label
                      htmlFor="cart-phone"
                      className="block text-sm font-semibold text-ink-muted"
                    >
                      {t("cart.phone")}
                      <input
                        id="cart-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        dir="ltr"
                        value={customer.phone}
                        onChange={updateField("phone")}
                        placeholder={t("cart.phonePlaceholder")}
                        className={`${checkoutFieldClass} mt-1.5 rtl:text-right`}
                      />
                    </label>
                  </div>
                  <label
                    htmlFor="cart-address"
                    className="block text-sm font-semibold text-ink-muted"
                  >
                    {t("cart.address")}
                    <input
                      type="text"
                      id="cart-address"
                      autoComplete="street-address"
                      value={customer.address}
                      onChange={updateField("address")}
                      placeholder={t("cart.addressPlaceholder")}
                      className={`${checkoutFieldClass} mt-1.5`}
                    />
                  </label>
                </fieldset>
              </StoreCheckout>
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <div
            ref={setCheckoutFooter}
            className="shrink-0 border-t border-line bg-surface px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgb(var(--ink)/0.04)] empty:hidden"
          />
        )}
      </div>
    </div>
  );
}
