"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeCopy } from "@/lib/store/copy";
export type AdminNotice = {
  id: number;
  kind: string;
  read_at: string | null;
  created_at: string;
  product_id: string | null;
  order_id: string | null;
  orders?: { order_number: number } | null;
};
export function NotificationsPanel({
  notices,
  push,
  stock,
  orders,
  actions,
  onOpenOrder,
  onOpenProduct,
}: {
  notices: AdminNotice[];
  push: boolean;
  stock: { product_id: string; name_en: string; name_ar: string }[];
  orders: { id: string; order_number: number }[];
  actions: ReactNode;
  onOpenOrder: (id: string) => void;
  onOpenProduct: (id: string) => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = storeCopy[locale];
  const [help, setHelp] = useState(false);
  const [deviceHelp, setDeviceHelp] = useState("");
  useEffect(() => {
    const apple =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    setDeviceHelp(
      apple
        ? c.pushHelp
        : ar
          ? "فعّل التنبيهات واسمح بها في هذا المتصفح. لتنبيهات الهاتف، افتح لوحة الإدارة على هاتفك وفعّلها هناك."
          : "Enable alerts and allow notifications in this browser. For phone alerts, open admin on your phone and enable them there.",
    );
  }, [ar, c.pushHelp]);
  return (
    <section aria-label={c.notifications} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            {ar ? "تنبيهات هذا الجهاز" : "This device’s alerts"} ·{" "}
            <span className="text-ink-muted">
              {push
                ? ar
                  ? "مفعّلة"
                  : "Enabled"
                : ar
                  ? "غير مفعّلة"
                  : "Not enabled"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setHelp((v) => !v)}
            aria-expanded={help}
            aria-controls="push-setup-help"
            className="min-h-11 text-xs font-semibold text-brand underline"
          >
            {ar ? "مساعدة الإعداد" : "Setup help"}
          </button>
        </div>
        {actions}
        {help && (
          <p
            id="push-setup-help"
            className="w-full border-t border-line pt-3 text-sm text-ink-muted"
          >
            {deviceHelp}
          </p>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {!notices.length && (
          <li className="p-4 text-sm text-ink-muted">{c.empty}</li>
        )}
        {notices.map((n) => {
          const orderNumber =
            n.orders?.order_number ??
            orders.find((o) => o.id === n.order_id)?.order_number;
          const product = stock.find((s) => s.product_id === n.product_id);
          const title =
            n.kind === "order"
              ? `${c.newOrder}${orderNumber ? ` · DC-${orderNumber}` : ""}`
              : `${c.low}${n.product_id ? ` · ${product?.[ar ? "name_ar" : "name_en"] ?? n.product_id}` : ""}`;
          const target = n.kind === "order" ? n.order_id : n.product_id;
          return (
            <li key={n.id}>
              <button
                type="button"
                disabled={!target}
                onClick={() => {
                  if (!target) return;
                  if (n.kind === "order") onOpenOrder(target);
                  else onOpenProduct(target);
                }}
                className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/35 disabled:cursor-default disabled:hover:bg-surface"
              >
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <time
                    dateTime={n.created_at}
                    className="mt-1 block text-xs text-ink-muted"
                  >
                    {new Date(n.created_at).toLocaleString(
                      ar ? "ar-EG" : "en-GB",
                      {
                        timeZone: "Africa/Cairo",
                        dateStyle: "medium",
                        timeStyle: "short",
                      },
                    )}
                  </time>
                </span>
                <span className="flex items-center gap-3 text-xs text-brand">
                  {!n.read_at && <span>{c.unread}</span>}
                  {target && <span aria-hidden="true">{ar ? "←" : "→"}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
