"use client";

import { useId } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { financeCopy, type ExpenseCategory } from "@/lib/store/finance-copy";

const colors: Record<ExpenseCategory, string> = {
  inventory: "#3c6048",
  marketing: "#b16d43",
  shipping: "#537d90",
  packaging: "#b58a27",
  overhead: "#846b95",
  other: "#767b59",
};

/** Uses the complete filtered RPC totals, never just the current register page. */
export function ExpenseCategoryChart({
  items,
}: {
  items: { category: ExpenseCategory; amount: number; count: number }[];
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const titleId = useId();
  const descriptionId = useId();
  const categories = financeCopy[locale].categories;
  const money = (amount: number) =>
    new Intl.NumberFormat(ar ? "ar-EG" : "en-GB", {
      style: "currency",
      currency: "EGP",
    }).format(amount);
  const percent = (value: number) =>
    value < 0.1
      ? ar
        ? "أقل من ٠٫١٪"
        : "<0.1%"
      : new Intl.NumberFormat(ar ? "ar-EG" : "en-GB", {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(value / 100);
  const rows = items.filter(
    (item) => Number.isFinite(Number(item.amount)) && Number(item.amount) > 0,
  );
  const total = rows.reduce((sum, item) => sum + Number(item.amount), 0);
  if (!total) return null;
  let offset = 0;
  const slices = rows.map((item) => {
    const share = (Number(item.amount) / total) * 100;
    const slice = { ...item, share, offset };
    offset += share;
    return slice;
  });
  const title = ar
    ? "نسبة المصروفات حسب الفئة"
    : "Share of spending by category";
  const description = slices
    .map(
      (item) =>
        `${categories[item.category]}: ${money(item.amount)} (${percent(item.share)})`,
    )
    .join("; ");

  return (
    <div className="mt-3 grid min-w-0 items-center gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        className="mx-auto h-36 w-36 shrink-0"
      >
        <title id={titleId}>{title}</title>
        <desc id={descriptionId}>{description}</desc>
        <g
          fill="none"
          strokeWidth="14"
          transform="rotate(-90 50 50)"
          aria-hidden="true"
        >
          {slices.map((item) => (
            <circle
              key={item.category}
              cx="50"
              cy="50"
              r="38"
              pathLength="100"
              stroke={colors[item.category]}
              strokeDasharray={`${item.share} ${100 - item.share}`}
              strokeDashoffset={-item.offset}
            >
              <title>
                {categories[item.category]} · {money(item.amount)} ·{" "}
                {percent(item.share)}
              </title>
            </circle>
          ))}
        </g>
        <text
          x="50"
          y="49"
          textAnchor="middle"
          className="fill-ink text-[12px] font-semibold"
          aria-hidden="true"
        >
          {new Intl.NumberFormat(ar ? "ar-EG" : "en-GB", {
            style: "percent",
          }).format(1)}
        </text>
        <text
          x="50"
          y="60"
          textAnchor="middle"
          className="fill-ink-muted text-[6px]"
          aria-hidden="true"
        >
          {ar ? "من المصروفات" : "of spending"}
        </text>
      </svg>
      <dl className="min-w-0 space-y-2">
        {slices.map((item) => (
          <div
            key={item.category}
            className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-canvas-sunk px-3 py-2"
          >
            <dt className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[item.category] }}
              />
              <span>{categories[item.category]}</span>
            </dt>
            <dd className="max-w-full break-words text-end text-sm font-semibold tabular-nums">
              {money(item.amount)}
              <span className="ms-2 text-xs font-normal text-ink-muted">
                {percent(item.share)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
