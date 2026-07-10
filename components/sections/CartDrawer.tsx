"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAnnouncer } from "@/components/providers/Announcer";
import { ClayButton } from "@/components/ui/ClayButton";
import { WhatsAppIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { getProduct } from "@/lib/products";
import { buildOrderLink, buildOrderMessage, type Customer } from "@/lib/whatsapp";
import { INSTAGRAM_DM_URL, STORAGE_CUSTOMER } from "@/lib/config";
import { trackCheckoutLead } from "@/lib/meta";

export function CartDrawer() {
  const { lines, count, isOpen, close, increment, decrement, remove, hasPrices, subtotal } =
    useCart();
  const { t, locale, dir, messages } = useLocale();
  const announce = useAnnouncer();

  const [customer, setCustomer] = useState<Customer>({ name: "", phone: "", address: "" });
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load any saved delivery details once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_CUSTOMER);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setCustomer({
            name: String(parsed.name ?? ""),
            phone: String(parsed.phone ?? ""),
            address: String(parsed.address ?? ""),
          });
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  // Persist details so returning customers don't retype them. Gated on `loaded`
  // so the initial empty default never overwrites saved details before the load
  // effect restores them (mirrors CartProvider's `hydrated` gate).
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_CUSTOMER, JSON.stringify(customer));
    } catch {
      /* ignore */
    }
  }, [customer, loaded]);

  const updateField =
    (key: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setCustomer((c) => ({ ...c, [key]: e.target.value }));

  const detailsComplete =
    customer.name.trim() !== "" &&
    customer.phone.trim() !== "" &&
    customer.address.trim() !== "";
  const canCheckout = lines.length > 0 && detailsComplete;

  // Total saved vs. original prices (for the discount line in the summary).
  const savings = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const p = getProduct(l.id);
        if (p?.price == null || p.originalPrice == null) return sum;
        return sum + Math.max(0, p.originalPrice - p.price) * l.qty;
      }, 0),
    [lines],
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
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
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

  // Only build the (potentially long) order link once details are complete — not
  // on every keystroke while the form is still being filled in.
  const checkoutHref = useMemo(
    () => (canCheckout ? buildOrderLink(lines, locale, messages, customer) : ""),
    [canCheckout, lines, locale, messages, customer],
  );

  // The handoff to chat is the only conversion this site can honestly report:
  // everything after it — price, delivery, payment — happens in a thread Meta
  // never sees. Hence `Lead`, never `Purchase`. Fire-and-forget: the CTA opens
  // in a new tab, so this page stays alive to finish hashing and sending.
  const handleCheckoutLead = useCallback(
    (channel: "whatsapp" | "instagram") => {
      void trackCheckoutLead(lines, channel, customer);
    },
    [lines, customer],
  );

  // Instagram has no DM pre-fill, so mirror the WhatsApp flow by copying the same
  // order text (delivery details included) to the clipboard for the customer to
  // paste, then open the DM thread.
  const handleInstagramCheckout = useCallback(() => {
    handleCheckoutLead("instagram");
    navigator.clipboard
      ?.writeText(buildOrderMessage(lines, locale, messages, customer))
      .catch(() => {
        /* clipboard may be blocked; the DM still opens */
      });
    announce(t("cart.copiedForInstagram"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }, [handleCheckoutLead, lines, locale, messages, customer, announce, t]);

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
        className={`absolute inset-y-0 end-0 flex h-full w-[min(26rem,100%)] flex-col border-s border-line bg-canvas shadow-clay-lg transition-transform duration-300 ease-out ${offClass}`}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
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

        {/* body */}
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-blob bg-canvas-sunk">
              <ShoppingBag className="h-9 w-9 text-ink-muted" aria-hidden="true" />
            </span>
            <p className="text-lg text-ink-muted">{t("cart.empty")}</p>
            <ClayButton href="#characters" variant="primary" onClick={close as never}>
              {t("cart.emptyCta")}
            </ClayButton>
          </div>
        ) : (
          <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {lines.map((line) => {
              const product = getProduct(line.id);
              if (!product) return null;
              const name = product.name[locale];
              return (
                <li
                  key={line.id}
                  className="flex gap-3 rounded-clay border border-line bg-surface p-3 shadow-clay-sm"
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
                      <span className="font-display font-semibold text-ink">{name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          remove(line.id);
                          announce(t("cart.removed", { name }));
                        }}
                        aria-label={`${t("cart.remove")} — ${name}`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-clay text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40 [touch-action:manipulation] cursor-pointer"
                      >
                        <Trash2 className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
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
                            announce(`${name} — ${t("cart.quantity")}: ${line.qty + 1}`);
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

        {/* footer / checkout */}
        <div className="border-t border-line px-5 py-4">
          {hasPrices ? (
            <div className="mb-3 space-y-1">
              <div className="flex items-center justify-between font-display text-lg font-bold text-ink">
                <span>{t("cart.subtotal")}</span>
                <span className="tabular">
                  {subtotal} {messages.cart.currency}
                </span>
              </div>
              {savings > 0 && (
                <div className="flex items-center justify-between text-sm font-semibold text-brand">
                  <span>{t("cart.savings")}</span>
                  <span className="tabular">
                    -{savings} {messages.cart.currency}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="mb-3 text-sm leading-relaxed text-ink-muted">
              {t("cart.requestNote")}
            </p>
          )}

          {/* delivery details — required before checkout */}
          {lines.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="font-display text-sm font-semibold text-ink">
                {t("cart.detailsTitle")}
              </p>
              <label htmlFor="cart-name" className="sr-only">
                {t("cart.name")}
              </label>
              <input
                id="cart-name"
                type="text"
                autoComplete="name"
                value={customer.name}
                onChange={updateField("name")}
                placeholder={t("cart.namePlaceholder")}
                className="w-full rounded-clay border border-line bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
              />
              <label htmlFor="cart-phone" className="sr-only">
                {t("cart.phone")}
              </label>
              <input
                id="cart-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={customer.phone}
                onChange={updateField("phone")}
                placeholder={t("cart.phonePlaceholder")}
                className="w-full rounded-clay border border-line bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
              />
              <label htmlFor="cart-address" className="sr-only">
                {t("cart.address")}
              </label>
              <input
                id="cart-address"
                type="text"
                autoComplete="street-address"
                value={customer.address}
                onChange={updateField("address")}
                placeholder={t("cart.addressPlaceholder")}
                className="w-full rounded-clay border border-line bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
              />
              {!detailsComplete && (
                <p className="text-xs leading-relaxed text-ink-muted">
                  {t("cart.detailsRequired")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {!canCheckout ? (
              <>
                <ClayButton variant="whatsapp" className="w-full" disabled type="button">
                  <WhatsAppIcon className="h-5 w-5" />
                  {t("cart.checkout")}
                </ClayButton>
                <ClayButton variant="accent" className="w-full" disabled type="button">
                  <InstagramIcon className="h-5 w-5" />
                  {t("cart.checkoutInstagram")}
                </ClayButton>
              </>
            ) : (
              <>
                <ClayButton
                  href={checkoutHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="whatsapp"
                  className="w-full"
                  onClick={() => handleCheckoutLead("whatsapp")}
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {t("cart.checkout")}
                </ClayButton>
                <ClayButton
                  href={INSTAGRAM_DM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="accent"
                  className="w-full"
                  onClick={handleInstagramCheckout}
                >
                  <InstagramIcon className="h-5 w-5" />
                  {copied ? t("cart.copied") : t("cart.checkoutInstagram")}
                </ClayButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
