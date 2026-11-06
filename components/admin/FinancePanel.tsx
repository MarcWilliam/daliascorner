"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import {
  expenseCategories,
  financeCopy,
  type ExpenseCategory,
  type FinanceOverview,
} from "@/lib/store/finance-copy";

type Expense = {
  id: string;
  entry_date: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  voided_at: string | null;
};
type MissingCost = {
  item_id: number;
  order_number: number;
  name_en: string;
  name_ar: string;
  quantity: number;
};
type Payment = {
  id: number;
  event_type: "payment" | "refund" | "correction" | "opening_paid";
  amount: number;
  occurred_at: string | null;
  orders: { order_number: number } | null;
};
const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
function cairoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function FinancePanel() {
  const { locale } = useLocale();
  const copy = financeCopy[locale];
  const [totals, setTotals] = useState<FinanceOverview | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [missing, setMissing] = useState<MissingCost[]>([]);
  const [range, setRange] = useState({ from: "", to: "" }),
    [draftRange, setDraftRange] = useState(range);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const expenseAttempt = useRef<{ id: string; signature: string } | null>(null);
  const money = (value: number | null) =>
    value === null
      ? copy.incomplete
      : new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
          style: "currency",
          currency: "EGP",
          maximumFractionDigits: 2,
        }).format(value);
  const percent = (value: number | null) =>
    value === null
      ? "—"
      : `${new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", { maximumFractionDigits: 2 }).format(value)}%`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      timeZone: "Africa/Cairo",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = storeClient();
      const [summary, entries, costs, activity] = await Promise.all([
        db.rpc("finance_overview", {
          p_from: range.from || null,
          p_to: range.to || null,
        }),
        db
          .from("finance_entries")
          .select("id,entry_date,category,amount,note,voided_at")
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100),
        db.rpc("finance_missing_costs"),
        db
          .from("finance_payment_events")
          .select("id,event_type,amount,occurred_at,orders(order_number)")
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(30),
      ]);
      if (summary.error || entries.error || costs.error || activity.error)
        throw new Error("LOAD_FAILED");
      setTotals(summary.data as FinanceOverview);
      setExpenses(entries.data as Expense[]);
      setMissing(costs.data as MissingCost[]);
      setPayments(activity.data as unknown as Payment[]);
      return true;
    } catch {
      setError(copy.loadError);
      return false;
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, copy.loadError]);
  useEffect(() => {
    setError("");
    void load();
  }, [load]);
  async function save(
    fn: () => PromiseLike<{ error: { message?: string } | null }>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      if (result.error) throw result.error;
      const refreshed = await load();
      setMessage(refreshed ? copy.saved : copy.savedRefresh);
      return true;
    } catch (failure) {
      setError(
        (failure as { message?: string })?.message?.includes(
          "COST_ALREADY_RECORDED",
        )
          ? copy.costLocked
          : copy.saveError,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get("amount"));
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
    ) {
      setError(copy.invalidAmount);
      return;
    }
    const payload = {
      p_date: values.get("date"),
      p_category: values.get("category"),
      p_amount: amount,
      p_note: String(values.get("note") ?? "").trim(),
    };
    const signature = JSON.stringify(payload);
    if (expenseAttempt.current?.signature !== signature)
      expenseAttempt.current = { id: crypto.randomUUID(), signature };
    const attemptId = expenseAttempt.current!.id;
    void save(() =>
      storeClient().rpc("add_finance_entry", { ...payload, p_id: attemptId }),
    ).then((ok) => {
      if (ok) {
        form.reset();
        expenseAttempt.current = null;
      }
    });
  }
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              {copy.intro}
            </p>
          </div>
          <ClayButton
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            {copy.refresh}
          </ClayButton>
        </div>
        <form
          className="mt-5 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              draftRange.from &&
              draftRange.to &&
              draftRange.from > draftRange.to
            ) {
              setError(copy.invalidDates);
              return;
            }
            setRange({ ...draftRange });
          }}
        >
          <label className="col-span-2 min-w-0 flex-1 text-sm min-[360px]:col-span-1 sm:min-w-40 sm:max-w-52">
            {copy.from}
            <input
              className={field}
              type="date"
              value={draftRange.from}
              onChange={(e) =>
                setDraftRange({ ...draftRange, from: e.target.value })
              }
            />
          </label>
          <label className="col-span-2 min-w-0 flex-1 text-sm min-[360px]:col-span-1 sm:min-w-40 sm:max-w-52">
            {copy.to}
            <input
              className={field}
              type="date"
              value={draftRange.to}
              onChange={(e) =>
                setDraftRange({ ...draftRange, to: e.target.value })
              }
            />
          </label>
          <ClayButton type="submit" disabled={loading || busy}>
            {copy.apply}
          </ClayButton>
          <ClayButton
            type="button"
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setDraftRange({ from: "", to: "" });
              setRange({ from: "", to: "" });
            }}
          >
            {copy.allTime}
          </ClayButton>
        </form>
        <p className="mt-2 text-xs text-ink-muted">{copy.period}</p>
        {message && (
          <p role="status" className="mt-4 text-sm font-semibold text-brand">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-orange/20 p-3 text-sm">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="mt-4 text-sm text-ink-muted">
            {copy.loading}
          </p>
        )}
      </div>
      {totals && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                copy.netCollected,
                money(totals.net_collected),
                copy.receiptsHint,
              ],
              [copy.spent, money(totals.cash_spent), copy.spentHint],
              [copy.cashBalance, money(totals.cash_balance), copy.cashHint],
              [
                copy.operatingResult,
                money(totals.operating_result),
                copy.operatingHint,
              ],
            ].map(([title, value, hint]) => (
              <div key={title} className={panel}>
                <h2 className="text-sm font-semibold text-ink-muted">
                  {title}
                </h2>
                <p className="mt-3 break-words font-display text-2xl font-bold tabular-nums">
                  {value}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  {hint}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
            <p>
              {copy.margin}:{" "}
              <strong className="tabular-nums">
                {percent(totals.operating_margin)}
              </strong>
            </p>
            {(range.from || range.to) && (
              <p className="text-ink-muted">
                {range.from ? date(range.from) : "…"} –{" "}
                {range.to ? date(range.to) : "…"}
              </p>
            )}
          </div>
          {totals.missing_cost_items > 0 && (
            <p
              role="status"
              className="rounded-2xl border border-orange/40 bg-orange/15 p-4 text-sm"
            >
              {copy.missing}
            </p>
          )}
          {totals.opening_paid_orders > 0 && (
            <p className="rounded-2xl border border-line bg-canvas-sunk p-4 text-sm text-ink-muted">
              {copy.opening}{" "}
              <strong>{money(totals.opening_paid_amount)}</strong>
            </p>
          )}
        </>
      )}
      {totals && (
        <section className={panel}>
          <h2 className="text-lg">{copy.addExpense}</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            {copy.expenseIntro}
          </p>
          <form className="mt-4" onSubmit={addExpense}>
            <fieldset
              disabled={busy || loading}
              className="grid gap-4 sm:grid-cols-3"
            >
              <label className="text-sm">
                {copy.amount}
                <input
                  className={field}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max="9999999999.99"
                  name="amount"
                  required
                />
              </label>
              <label className="text-sm">
                {copy.category}
                <select className={field} name="category" defaultValue="other">
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {copy.categories[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-sm">
                {copy.date}
                <input
                  className={field}
                  type="date"
                  name="date"
                  defaultValue={cairoDate()}
                  max={cairoDate()}
                  required
                />
              </label>
              <label className="text-sm sm:col-span-3">
                {copy.note}
                <input
                  className={field}
                  name="note"
                  maxLength={1000}
                  placeholder={copy.notePlaceholder}
                />
              </label>
              <div className="sm:col-span-3">
                <ClayButton type="submit">
                  {busy ? copy.saving : copy.add}
                </ClayButton>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {missing.length > 0 && (
        <section className={panel}>
          <h2 className="text-lg">{copy.missingTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            {copy.missingHint}
          </p>
          <div className="mt-4 divide-y divide-line">
            {missing.map((item) => (
              <form
                key={item.item_id}
                className="flex flex-wrap items-end gap-3 py-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  void save(() =>
                    storeClient().rpc("set_order_item_cost", {
                      p_item: item.item_id,
                      p_cost: Number(values.get("cost")),
                    }),
                  );
                }}
              >
                <div className="min-w-0 flex-1 self-center">
                  <p className="font-semibold">
                    {locale === "ar" ? item.name_ar : item.name_en}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {copy.order} #{item.order_number} · {copy.quantity}:{" "}
                    {item.quantity}
                  </p>
                </div>
                <label className="w-40 text-sm">
                  {copy.unitCost}
                  <input
                    className={field}
                    name="cost"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    required
                    disabled={busy || loading}
                  />
                </label>
                <ClayButton
                  type="submit"
                  variant="outline"
                  disabled={busy || loading}
                >
                  {copy.saveCost}
                </ClayButton>
              </form>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{copy.missingLimit}</p>
        </section>
      )}
      {totals && (
        <details className={panel}>
          <summary className="min-h-11 cursor-pointer font-display text-lg font-semibold">
            {copy.breakdown}
          </summary>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              [copy.payments, totals.collected],
              [copy.refunds, totals.refunded],
              [copy.corrections, totals.corrections],
              [copy.netItems, totals.items_collected],
              [copy.netDelivery, totals.delivery_collected],
              [
                copy.productCosts,
                totals.missing_cost_items ? null : totals.known_product_cost,
              ],
              [copy.gross, totals.gross_profit],
              [copy.operating, totals.operating_spent],
              [copy.purchases, totals.inventory_spent],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex justify-between gap-3 border-b border-line py-2"
              >
                <dt>{label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">
                  {money(value as number | null)}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-b border-line py-2">
              <dt>{copy.grossMargin}</dt>
              <dd>{percent(totals.gross_margin)}</dd>
            </div>
          </dl>
          <p className="mt-5 max-w-4xl text-sm leading-relaxed text-ink-muted">
            {copy.methodology}
          </p>
          {totals.tracking_started_at && (
            <p className="mt-3 text-xs text-ink-muted">
              {copy.trackingSince}: {date(totals.tracking_started_at)}
            </p>
          )}
          {Boolean(totals.untracked_refunded_orders) && (
            <p className="mt-3 rounded-xl bg-orange/15 p-3 text-sm">
              {copy.legacyRefunds} {totals.untracked_refunded_orders}
            </p>
          )}
        </details>
      )}
      {totals && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="text-lg">{copy.history}</h2>
            <p className="mt-2 text-xs text-ink-muted">{copy.entriesHint}</p>
            {!expenses.length && (
              <p className="mt-5 text-sm text-ink-muted">
                {copy.emptyExpenses}
              </p>
            )}
            <ul className="mt-4 divide-y divide-line">
              {expenses.map((entry) => (
                <li
                  key={entry.id}
                  className={`flex flex-wrap items-center justify-between gap-3 py-4 ${entry.voided_at ? "text-ink-muted" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {copy.categories[entry.category]}
                      {entry.voided_at && (
                        <span className="ms-2 rounded-full bg-canvas-sunk px-2 py-1 text-xs">
                          {copy.voided}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {date(entry.entry_date)}
                    </p>
                    {entry.note && (
                      <p className="mt-2 break-words text-sm text-ink-muted">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <p
                    className={`font-semibold tabular-nums ${entry.voided_at ? "line-through" : ""}`}
                  >
                    {money(entry.amount)}
                  </p>
                  {!entry.voided_at && (
                    <button
                      className="min-h-11 rounded-xl px-3 text-sm text-brand underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50"
                      disabled={busy || loading}
                      onClick={() => {
                        if (window.confirm(copy.voidConfirm))
                          void save(() =>
                            storeClient().rpc("void_finance_entry", {
                              p_id: entry.id,
                            }),
                          );
                      }}
                    >
                      {copy.void}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className={panel}>
            <h2 className="text-lg">{copy.recentPayments}</h2>
            <p className="mt-2 text-xs text-ink-muted">{copy.activityHint}</p>
            {!payments.length && (
              <p className="mt-5 text-sm text-ink-muted">
                {copy.emptyPayments}
              </p>
            )}
            <ul className="mt-4 divide-y divide-line">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 py-4 text-sm"
                >
                  <div>
                    <p className="font-semibold">
                      {copy[payment.event_type]} · {copy.order} #
                      {payment.orders?.order_number ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {payment.occurred_at
                        ? date(payment.occurred_at)
                        : copy.undated}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {money(payment.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
