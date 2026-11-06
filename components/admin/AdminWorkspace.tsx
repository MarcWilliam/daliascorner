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
  },
  {
    id: "stock",
    icon: Package,
    en: "Stock",
    ar: "المخزون",
  },
  {
    id: "expenses",
    icon: ReceiptText,
    en: "Expenses",
    ar: "المصروفات",
  },
  {
    id: "finance",
    icon: WalletCards,
    en: "Financial report",
    ar: "التقرير المالي",
  },
  {
    id: "settings",
    icon: Settings,
    en: "Settings",
    ar: "الإعدادات",
  },
  {
    id: "notifications",
    icon: Bell,
    en: "Notifications",
    ar: "الإشعارات",
  },
  {
    id: "meta",
    icon: ChartNoAxesCombined,
    en: "Meta & ads",
    ar: "Meta والإعلانات",
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
  const selectedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches)
      selectedButton.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
  }, [section, locale]);
  return (
    <div className="admin-ui grid min-w-0 gap-3 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6">
      <aside className="min-w-0 lg:self-start lg:sticky lg:top-6">
        <nav
          aria-label={ar ? "أقسام إدارة المتجر" : "Store admin sections"}
          className="flex min-w-0 max-w-full gap-2 overflow-x-auto rounded-2xl border border-line bg-canvas-sunk p-1.5 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
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
                className={`flex min-h-12 shrink-0 items-center gap-2.5 rounded-full border px-3 text-start lg:rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 lg:w-full ${selected ? "border-brand bg-brand text-canvas" : "border-line bg-surface text-brand hover:bg-canvas-sunk lg:border-transparent lg:bg-transparent lg:text-ink-muted lg:hover:text-ink"}`}
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
        className="min-w-0 space-y-4"
        aria-labelledby="admin-section-title"
      >
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-line pb-3">
          <h1
            id="admin-section-title"
            tabIndex={-1}
            className="min-w-0 text-2xl sm:text-3xl"
          >
            {ar ? active.ar : active.en}
          </h1>
          {refreshControl && <div className="shrink-0">{refreshControl}</div>}
        </header>
        {children}
      </section>
    </div>
  );
}
