"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { storeClient } from "@/lib/store/client";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { accountRequestScope } from "@/lib/store/customer-account";
import { cairoDay } from "@/lib/store/manual-order-history";
import {
  expenseCategories,
  financeCopy,
  type ExpenseCategory,
} from "@/lib/store/finance-copy";
import { expenseCopy } from "@/lib/store/expense-copy";
import {
  defaultExpenseFilters,
  expensePageArgs,
  EXPENSE_PAGE_SIZE,
  type ExpenseFilters,
  type ExpensePage,
} from "@/lib/store/expense-page";

const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
const newDraft = () => ({
  amount: "",
  category: "other" as ExpenseCategory,
  date: cairoDay(),
  note: "",
});

export function ExpensesPanel({
  refreshKey = 0,
  hideRefresh = false,
}: { refreshKey?: number; hideRefresh?: boolean } = {}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = expenseCopy[locale],
    common = financeCopy[locale];
  const { session } = useCustomerAuth();
  const identity = session?.user.id ?? "guest";
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const mounted = useRef(true),
    requests = useRef(accountRequestScope()),
    mutation = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false),
    attempt = useRef<{ id: string; signature: string } | null>(null);
  const [filters, setFilters] = useState(defaultExpenseFilters),
    [draftFilters, setDraftFilters] = useState(defaultExpenseFilters);
  const [offset, setOffset] = useState(0),
    [page, setPage] = useState<ExpensePage | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false),
    [draft, setDraft] = useState(newDraft);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null),
    firstFilter = useRef<HTMLInputElement>(null);
  const formTitle = useRef<HTMLHeadingElement>(null),
    firstField = useRef<HTMLInputElement>(null),
    listTitle = useRef<HTMLHeadingElement>(null);
  const money = (value: number) =>
    new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(value);
  const number = (value: number) =>
    new Intl.NumberFormat(ar ? "ar-EG" : "en-EG").format(value);
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
      timeZone: "Africa/Cairo",
      dateStyle: "medium",
    }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
  const hasFilters = !!(
    filters.from ||
    filters.to ||
    filters.category !== "all" ||
    filters.search ||
    filters.status !== "active"
  );
  const filterSummary = [
    filters.status === "all"
      ? c.allStatuses
      : filters.status === "voided"
        ? c.voided
        : c.active,
    filters.from || filters.to
      ? `${filters.from ? date(filters.from) : "…"} – ${filters.to ? date(filters.to) : "…"}`
      : c.allDates,
    filters.category === "all"
      ? c.allCategories
      : common.categories[filters.category],
    filters.search ? `${c.search}: “${filters.search}”` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const load = useCallback(async () => {
    const request = requests.current.begin(),
      owner = identity;
    const current = () =>
      request.current() && mounted.current && currentIdentity.current === owner;
    setLoading(true);
    try {
      const { data, error } = await storeClient()
        .rpc("expense_page", expensePageArgs(filters, offset))
        .abortSignal(request.signal);
      if (!current()) return false;
      if (error || !data || !Array.isArray(data.entries))
        throw Error("LOAD_FAILED");
      if (offset > 0 && offset >= Number(data.total_count)) {
        setOffset(
          Math.max(
            0,
            Math.floor((Number(data.total_count) - 1) / EXPENSE_PAGE_SIZE) *
              EXPENSE_PAGE_SIZE,
          ),
        );
        return true;
      }
      setPage(data as ExpensePage);
      return true;
    } catch {
      if (current()) setError(c.loadError);
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }, [filters, offset, identity, c.loadError]);
  useEffect(() => {
    setPage(null);
    setError("");
    void load();
    return () => requests.current.cancel();
  }, [load, refreshKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.cancel();
      mutation.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (formOpen) firstField.current?.focus();
  }, [formOpen]);
  useEffect(() => {
    if (filtersOpen) firstFilter.current?.focus();
  }, [filtersOpen]);
  async function save(
    name: string,
    args: Record<string, unknown>,
    success: string,
  ) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const owner = identity,
      controller = new AbortController();
    mutation.current = controller;
    const current = () =>
      mounted.current &&
      currentIdentity.current === owner &&
      mutation.current === controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { error } = await storeClient()
        .rpc(name, args)
        .abortSignal(controller.signal);
      if (!current()) return false;
      if (error) throw error;
      const refreshed = await load();
      if (!current()) return false;
      setMessage(refreshed ? success : c.refreshError);
      return true;
    } catch {
      if (current()) setError(common.saveError);
      return false;
    } finally {
      clearTimeout(timer);
      if (current()) {
        mutation.current = null;
        mutationBusy.current = false;
        setBusy(false);
      }
    }
  }
  function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
    ) {
      setError(common.invalidAmount);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date > cairoDay()) {
      setError(c.invalidDate);
      return;
    }
    const payload = {
      p_date: draft.date,
      p_category: draft.category,
      p_amount: amount,
      p_note: draft.note.trim(),
    };
    const signature = JSON.stringify({ owner: identity, ...payload });
    if (attempt.current?.signature !== signature)
      attempt.current = { id: crypto.randomUUID(), signature };
    void save(
      "add_finance_entry",
      { ...payload, p_id: attempt.current.id },
      c.saved,
    ).then((ok) => {
      if (ok) {
        const matches =
          filters.status !== "voided" &&
          (!filters.from || payload.p_date >= filters.from) &&
          (!filters.to || payload.p_date <= filters.to) &&
          (filters.category === "all" ||
            payload.p_category === filters.category) &&
          payload.p_note.toLowerCase().includes(filters.search.toLowerCase());
        if (!matches) setMessage(c.savedOutsideFilters);
        setOffset(0);
        setDraft(newDraft());
        attempt.current = null;
        setFormOpen(false);
        listTitle.current?.focus();
      }
    });
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draftFilters.from &&
      draftFilters.to &&
      draftFilters.from > draftFilters.to
    ) {
      setError(common.invalidDates);
      return;
    }
    if (draftFilters.search.trim().length > 200) {
      setError(c.invalidSearch);
      return;
    }
    setFilters({ ...draftFilters, search: draftFilters.search.trim() });
    setOffset(0);
    setMessage("");
    setFiltersOpen(false);
    filterButton.current?.focus();
  }
  function clearFilters() {
    const cleared = defaultExpenseFilters();
    setDraftFilters(cleared);
    setFilters(cleared);
    setOffset(0);
    setMessage("");
    setFiltersOpen(false);
    filterButton.current?.focus();
  }
  function updateFilter<K extends keyof ExpenseFilters>(
    key: K,
    value: ExpenseFilters[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <header className={hideRefresh ? "space-y-2" : panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {!hideRefresh && <h2 className="text-xl">{c.title}</h2>}
            <p
              className={`${hideRefresh ? "" : "mt-2"} max-w-2xl text-sm leading-6 text-ink-muted`}
            >
              {hideRefresh ? c.compactIntro : c.intro}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              ref={filterButton}
              type="button"
              disabled={busy}
              aria-expanded={filtersOpen}
              aria-controls="expense-filter-region"
              onClick={() => setFiltersOpen((value) => !value)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-brand focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50"
            >
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              {c.filters}
            </button>
            {!formOpen && (
              <ClayButton
                disabled={loading || busy}
                onClick={() => {
                  setFormOpen(true);
                  setMessage("");
                }}
              >
                <Plus aria-hidden="true" className="h-5 w-5" />
                {c.add}
              </ClayButton>
            )}
            {!hideRefresh && (
              <button
                type="button"
                disabled={loading || busy}
                aria-label={c.refresh}
                title={c.refresh}
                onClick={() => {
                  setError("");
                  void load();
                }}
                className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-brand focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 break-words text-xs leading-5 text-ink-muted">
            {filterSummary}
          </p>
          {hasFilters && (
            <button
              type="button"
              disabled={loading || busy}
              className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-brand underline disabled:opacity-50"
              onClick={clearFilters}
            >
              {c.clear}
            </button>
          )}
        </div>
        {message && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-leaf-soft/70 p-3 text-sm font-semibold text-brand"
          >
            {message}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-orange/20 p-3 text-sm"
          >
            <p>{error}</p>
            {!page && (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg font-semibold text-brand underline"
                disabled={loading}
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                {c.retry}
              </button>
            )}
          </div>
        )}
      </header>
      {formOpen && (
        <section className={panel} aria-labelledby="expense-form-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="expense-form-title" ref={formTitle} className="text-lg">
                {c.formTitle}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
                {common.expenseIntro}
              </p>
            </div>
            <button
              type="button"
              aria-label={c.cancel}
              title={c.cancel}
              disabled={busy}
              onClick={() => {
                setFormOpen(false);
                setMessage(c.closedForm);
              }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-brand disabled:opacity-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <form className="mt-4" onSubmit={addExpense}>
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm">
                {common.amount}
                <input
                  ref={firstField}
                  className={field}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max="9999999999.99"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.value })
                  }
                  required
                />
              </label>
              <label className="text-sm">
                {common.category}
                <select
                  className={field}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as ExpenseCategory,
                    })
                  }
                >
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {common.categories[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-sm">
                {common.date}
                <input
                  className={field}
                  type="date"
                  max={cairoDay()}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  required
                />
              </label>
              <label className="text-sm sm:col-span-3">
                {common.note}
                <input
                  className={field}
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  maxLength={1000}
                  placeholder={common.notePlaceholder}
                />
              </label>
              <div className="flex flex-wrap gap-3 sm:col-span-3">
                <ClayButton type="submit">
                  {busy ? common.saving : common.add}
                </ClayButton>
                <ClayButton
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormOpen(false);
                    setMessage(c.closedForm);
                  }}
                >
                  {c.cancel}
                </ClayButton>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <section
        id="expense-filter-region"
        hidden={!filtersOpen}
        className={panel}
        aria-label={c.filters}
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={applyFilters}
        >
          <label className="min-w-0 text-sm">
            {common.from}
            <input
              ref={firstFilter}
              className={field}
              type="date"
              value={draftFilters.from}
              onChange={(e) => updateFilter("from", e.target.value)}
            />
          </label>
          <label className="min-w-0 text-sm">
            {common.to}
            <input
              className={field}
              type="date"
              value={draftFilters.to}
              onChange={(e) => updateFilter("to", e.target.value)}
            />
          </label>
          <label className="text-sm">
            {common.category}
            <select
              className={field}
              value={draftFilters.category}
              onChange={(e) =>
                updateFilter(
                  "category",
                  e.target.value as ExpenseFilters["category"],
                )
              }
            >
              <option value="all">{c.allCategories}</option>
              {expenseCategories.map((category) => (
                <option key={category} value={category}>
                  {common.categories[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {c.status}
            <select
              className={field}
              value={draftFilters.status}
              onChange={(e) =>
                updateFilter(
                  "status",
                  e.target.value as ExpenseFilters["status"],
                )
              }
            >
              <option value="active">{c.active}</option>
              <option value="voided">{c.voided}</option>
              <option value="all">{c.allStatuses}</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2 lg:col-span-2">
            {c.search}
            <input
              className={field}
              type="search"
              value={draftFilters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              maxLength={200}
              placeholder={c.searchPlaceholder}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
            <ClayButton type="submit" disabled={loading || busy}>
              {c.apply}
            </ClayButton>
            <button
              type="button"
              disabled={loading || busy}
              className="min-h-12 rounded-xl px-3 text-sm font-semibold text-brand underline disabled:opacity-50"
              onClick={clearFilters}
            >
              {c.clear}
            </button>
            <p className="max-w-xl text-xs leading-5 text-ink-muted">
              {c.filtersHint}
            </p>
          </div>
        </form>
      </section>
      {loading && (
        <p role="status" className="px-1 text-sm text-ink-muted">
          {c.loading}
        </p>
      )}
      {page && (
        <>
          <section
            className="rounded-2xl border border-line bg-surface px-5 py-3"
            aria-label={c.activeTotal}
          >
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-xs font-semibold text-ink-muted">
                  {c.activeTotal}
                </dt>
                <dd className="mt-1 break-words font-display text-xl font-bold tabular-nums">
                  {money(page.active_total)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-muted">
                  {c.count}
                </dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums">
                  {number(page.total_count)}
                </dd>
              </div>
              {page.voided_count > 0 && (
                <div>
                  <dt className="text-xs font-semibold text-ink-muted">
                    {c.voidedTotal}
                  </dt>
                  <dd className="mt-1 break-words font-display text-xl font-bold tabular-nums">
                    {money(page.voided_total)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {c.summaryHint}
            </p>
          </section>
          <section className={panel} aria-labelledby="expense-register-title">
            <h2
              id="expense-register-title"
              ref={listTitle}
              tabIndex={-1}
              className="text-lg"
            >
              {c.register}
            </h2>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {c.editHint}
            </p>
            {!page.entries.length ? (
              <div className="py-10 text-center">
                <p className="font-semibold">{c.empty}</p>
                <p className="mt-2 text-sm text-ink-muted">{c.emptyHint}</p>
              </div>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="mt-5 hidden gap-4 border-b border-line pb-2 text-xs font-semibold text-ink-muted lg:grid lg:grid-cols-[7rem_11rem_minmax(0,1fr)_9rem_6rem]"
                >
                  {[c.paidDate, c.category, c.note, c.amount, c.actions].map(
                    (label) => (
                      <span key={label}>{label}</span>
                    ),
                  )}
                </div>
                <ul className="mt-3 divide-y divide-line lg:mt-0">
                  {page.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className={`grid grid-cols-2 items-start gap-x-4 gap-y-3 py-4 lg:grid-cols-[7rem_11rem_minmax(0,1fr)_9rem_6rem] ${entry.voided_at ? "text-ink-muted" : ""}`}
                    >
                      <div>
                        <p className="mb-1 text-xs text-ink-muted lg:hidden">
                          {c.paidDate}
                        </p>
                        <time dateTime={entry.entry_date} className="text-sm">
                          {date(entry.entry_date)}
                        </time>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {common.categories[entry.category]}
                        </p>
                        {entry.voided_at && (
                          <span className="mt-1 inline-block rounded-full bg-canvas-sunk px-2 py-1 text-xs">
                            {c.voided}
                          </span>
                        )}
                      </div>
                      <p className="col-span-2 min-w-0 break-words text-sm leading-6 text-ink-muted lg:col-span-1">
                        {entry.note || c.noNote}
                      </p>
                      <p
                        className={`min-w-0 break-words text-sm font-semibold tabular-nums ${entry.voided_at ? "line-through" : ""}`}
                      >
                        {money(entry.amount)}
                      </p>
                      {!entry.voided_at ? (
                        <button
                          type="button"
                          disabled={busy || loading}
                          className="min-h-11 justify-self-end rounded-xl px-2 text-sm font-semibold text-brand underline focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50 lg:justify-self-start"
                          onClick={() => {
                            if (window.confirm(common.voidConfirm))
                              void save(
                                "void_finance_entry",
                                { p_id: entry.id },
                                c.voidedSuccess,
                              );
                          }}
                        >
                          {common.void}
                        </button>
                      ) : (
                        <span className="text-end text-xs lg:text-start">
                          {c.voided}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p role="status" className="text-xs text-ink-muted">
                {c.showing} {number(page.total_count ? offset + 1 : 0)}–
                {number(
                  Math.min(offset + page.entries.length, page.total_count),
                )}{" "}
                {c.of} {number(page.total_count)} {c.entries}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || busy || offset === 0}
                  onClick={() =>
                    setOffset((value) => Math.max(0, value - EXPENSE_PAGE_SIZE))
                  }
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-brand disabled:opacity-40"
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className="h-4 w-4 rtl:rotate-180"
                  />
                  {c.previous}
                </button>
                <button
                  type="button"
                  disabled={loading || busy || !page.has_more}
                  onClick={() =>
                    setOffset((value) => value + EXPENSE_PAGE_SIZE)
                  }
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-brand disabled:opacity-40"
                >
                  {c.next}
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 rtl:rotate-180"
                  />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
