"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "dialog" | "drawer";
  busy?: boolean;
  canClose?: () => boolean;
  footer?: ReactNode;
};
/** Native top-layer modal provides focus containment, inert background and Escape. */
export function AdminDialog({
  open,
  onClose,
  title,
  children,
  variant = "dialog",
  busy = false,
  canClose,
  footer,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = () => {
    if (!busy && (!canClose || canClose())) onClose();
  };
  const titleId = useId();
  const { locale, dir } = useLocale();
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!open) {
      if (el.open) el.close();
      return;
    }
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (el.open) el.close();
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => {
        // Switching from one completed task to another can remove the original
        // trigger. Never focus behind an open modal or a hidden closed dialog.
        if (document.querySelector("dialog[open]")) return;
        if (
          trigger?.isConnected &&
          trigger !== document.body &&
          trigger.getClientRects().length &&
          !trigger.closest("dialog:not([open])")
        )
          trigger.focus();
        else document.getElementById("admin-section-title")?.focus();
      });
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      dir={dir}
      aria-labelledby={titleId}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (item) =>
            !item.matches(":disabled") &&
            item.tabIndex >= 0 &&
            item.getClientRects().length > 0,
        );
        const first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close.current();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          close.current();
      }}
      className={`fixed overflow-hidden border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/45 ${variant === "drawer" ? "inset-y-0 end-0 start-auto !m-0 h-dvh max-h-none w-full max-w-2xl rounded-none border-y-0 border-e-0" : "inset-0 !m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl rounded-2xl"}`}
    >
      <div
        className={`flex min-h-0 flex-col ${variant === "drawer" ? "h-full" : "max-h-[calc(100dvh_-_2rem)]"}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => close.current()}
            aria-label={locale === "ar" ? "إغلاق" : "Close"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-brand hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-40"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 border-t border-line bg-surface px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
