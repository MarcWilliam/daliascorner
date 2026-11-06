"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

export type AdminSection =
  | "orders"
  | "stock"
  | "expenses"
  | "finance"
  | "settings"
  | "notifications"
  | "meta";
type Props = {
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  unreadCount: number;
  refreshControl?: ReactNode;
  children: ReactNode;
};
const sections = [
  {
    id: "orders",
    icon: ShoppingBag,
    en: "Orders",
    ar: "الطلبات",
    hint: "Manage fulfilment, payments and chat orders.",
    hintAr: "تابع تجهيز الطلبات والدفع وطلبات المحادثات.",
  },
  {
    id: "stock",
    icon: Package,
    en: "Stock",
    ar: "المخزون",
    hint: "Check availability, restock and record product costs.",
    hintAr: "راجع المتاح وأضف المخزون وحدد تكلفة المنتجات.",
  },
  {
    id: "expenses",
    icon: ReceiptText,
    en: "Expenses",
    ar: "المصروفات",
    hint: "Record and review what the business has spent.",
    hintAr: "سجّل وراجع المبالغ التي صرفها المشروع.",
  },
  {
    id: "finance",
    icon: WalletCards,
    en: "Financial report",
    ar: "التقرير المالي",
    hint: "Compare collected money, spending and paid-order profit.",
    hintAr: "قارن المقبوضات والمصروفات وتقدير ربح الطلبات المدفوعة.",
  },
  {
    id: "settings",
    icon: Settings,
    en: "Settings",
    ar: "الإعدادات",
    hint: "Set delivery areas, fees and customer payment options.",
    hintAr: "حدّد مناطق التوصيل والرسوم وطرق الدفع للعملاء.",
  },
  {
    id: "notifications",
    icon: Bell,
    en: "Notifications",
    ar: "الإشعارات",
    hint: "Manage phone alerts and review store activity.",
    hintAr: "أدر تنبيهات الهاتف وراجع نشاط المتجر.",
  },
  {
    id: "meta",
    icon: ChartNoAxesCombined,
    en: "Meta & ads",
    ar: "Meta والإعلانات",
    hint: "Monitor website event delivery and Meta reporting.",
    hintAr: "تابع إرسال أحداث الموقع وتقارير Meta.",
  },
] as const;

export function AdminWorkspace({
  section,
  onSectionChange,
  unreadCount,
  refreshControl,
  children,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const active = sections.find((item) => item.id === section)!;
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedButton.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [section]);
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-7">
      <aside className="min-w-0 lg:self-start lg:sticky lg:top-6">
        <p className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted lg:block">
          {ar ? "إدارة المتجر" : "Store workspace"}
        </p>
        <nav
          aria-label={ar ? "أقسام إدارة المتجر" : "Store admin sections"}
          className="flex min-w-0 gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 lg:flex-col lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0"
        >
          {sections.map((item) => {
            const selected = section === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={selected ? selectedButton : undefined}
                type="button"
                aria-pressed={selected}
                aria-controls="admin-workspace-content"
                onClick={() => onSectionChange(item.id)}
                className={`flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl px-3 text-start text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 lg:w-full ${selected ? "bg-brand text-canvas" : "text-ink-muted hover:bg-canvas-sunk hover:text-ink"}`}
              >
                <Icon
                  aria-hidden="true"
                  className="h-[18px] w-[18px] shrink-0"
                />
                <span className="whitespace-nowrap">
                  {ar ? item.ar : item.en}
                </span>
                {item.id === "notifications" && unreadCount > 0 && (
                  <span
                    className={`ms-auto rounded-full px-1.5 py-0.5 text-[11px] leading-4 ${selected ? "bg-canvas/20" : "bg-leaf-soft text-brand"}`}
                  >
                    {unreadCount}
                  </span>
                )}
                {selected && (
                  <ChevronRight
                    aria-hidden="true"
                    className="ms-auto hidden h-4 w-4 shrink-0 rtl:rotate-180 lg:block"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>
      <section
        id="admin-workspace-content"
        className="min-w-0 space-y-5"
        aria-labelledby="admin-section-title"
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-line pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand">
              Dalia’s Corner · {ar ? "إدارة المتجر" : "Store admin"}
            </p>
            <h1 id="admin-section-title" className="mt-1 text-3xl sm:text-4xl">
              {ar ? active.ar : active.en}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              {ar ? active.hintAr : active.hint}
            </p>
          </div>
          {refreshControl && <div className="shrink-0">{refreshControl}</div>}
        </header>
        {children}
      </section>
    </div>
  );
}
