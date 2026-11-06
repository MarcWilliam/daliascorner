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
  List,
  LayoutGrid,
} from "lucide-react";
import { AdminDialog } from "./AdminDialog";
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
  type ExpenseEntry,
} from "@/lib/store/expense-page";

const field = "store-field mt-1";
const panel = "rounded-2xl border border-line bg-surface p-4";
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
  const [view, setView] = useState<"table" | "cards">("cards");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("dc.admin.expense-view");
      setView(
        stored === "table" || stored === "cards"
          ? stored
          : window.matchMedia("(min-width: 768px)").matches
            ? "table"
            : "cards",
      );
    } catch {
      setView(
        window.matchMedia("(min-width: 768px)").matches ? "table" : "cards",
      );
    }
  }, []);
  function changeView(next: "table" | "cards") {
    setView(next);
    try {
      localStorage.setItem("dc.admin.expense-view", next);
    } catch {}
  }
  const [voidEntry, setVoidEntry] = useState<ExpenseEntry | null>(null);
  const filterButton = useRef<HTMLButtonElement>(null),
    firstFilter = useRef<HTMLInputElement>(null);
  const firstField = useRef<HTMLInputElement>(null),
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
      }
    });
  }
  function closeExpenseForm() {
    if (busy) return;
    setFormOpen(false);
    setError("");
    setMessage(
      draft.amount ||
        draft.note ||
        draft.category !== "other" ||
        draft.date !== cairoDay()
        ? c.closedForm
        : "",
    );
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
    <section className="space-y-3" aria-busy={loading || busy}>
      <header className={hideRefresh ? "space-y-2" : panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!hideRefresh && <h2 className="text-xl">{c.title}</h2>}
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
            <ClayButton
              disabled={loading || busy}
              onClick={() => {
                setFormOpen(true);
                setMessage("");
                setError("");
              }}
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
              {c.add}
            </ClayButton>
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
        {error && !formOpen && !voidEntry && (
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
      <AdminDialog
        open={formOpen}
        title={c.formTitle}
        busy={busy}
        onClose={closeExpenseForm}
      >
        {error && (
          <p role="alert" className="rounded-xl bg-orange/20 p-3 text-sm">
            {error}
          </p>
        )}
        <form className="space-y-4" onSubmit={addExpense}>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              {common.amount}
              <input
                ref={firstField}
                autoFocus
                className={field}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                max="9999999999.99"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
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
            <label className="text-sm sm:col-span-2">
              {common.note}
              <input
                className={field}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                maxLength={1000}
                placeholder={common.notePlaceholder}
              />
            </label>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <ClayButton type="submit">
                {busy ? common.saving : common.add}
              </ClayButton>
              <ClayButton
                type="button"
                variant="outline"
                onClick={closeExpenseForm}
              >
                {c.cancel}
              </ClayButton>
            </div>
          </fieldset>
        </form>
      </AdminDialog>
      <AdminDialog
        open={voidEntry !== null}
        title={c.voidTitle}
        busy={busy}
        onClose={() => setVoidEntry(null)}
      >
        {voidEntry && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{c.voidDescription}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-canvas-sunk p-3 text-sm">
              <div>
                <dt className="text-ink-muted">{c.amount}</dt>
                <dd className="mt-1 font-semibold">
                  {money(voidEntry.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">{c.paidDate}</dt>
                <dd className="mt-1 font-semibold">
                  {date(voidEntry.entry_date)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-muted">{c.category}</dt>
                <dd className="mt-1">
                  {common.categories[voidEntry.category]}
                </dd>
              </div>
              {voidEntry.note && (
                <div className="col-span-2">
                  <dt className="text-ink-muted">{c.note}</dt>
                  <dd className="mt-1 break-words">{voidEntry.note}</dd>
                </div>
              )}
            </dl>
            {error && (
              <p role="alert" className="rounded-xl bg-orange/20 p-3 text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <ClayButton
                variant="outline"
                disabled={busy}
                onClick={() => setVoidEntry(null)}
              >
                {c.cancel}
              </ClayButton>
              <ClayButton
                disabled={busy}
                onClick={() => {
                  void save(
                    "void_finance_entry",
                    { p_id: voidEntry.id },
                    c.voidedSuccess,
                  ).then((ok) => {
                    if (ok) setVoidEntry(null);
                  });
                }}
              >
                {busy ? common.saving : c.voidAction}
              </ClayButton>
            </div>
          </div>
        )}
      </AdminDialog>
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
            <div className="mt-3 border-t border-line pt-3">
              <h2 className="text-sm font-semibold">{c.byCategory}</h2>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {c.categoryHint}
              </p>
              {page.category_totals?.length ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {page.category_totals.map((item) => (
                    <div
                      key={item.category}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-canvas-sunk px-3 py-2"
                    >
                      <dt className="text-xs text-ink-muted">
                        {common.categories[item.category]}
                      </dt>
                      <dd className="max-w-full break-words text-sm font-semibold tabular-nums">
                        {money(item.amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  {page.active_total > 0
                    ? c.categoryUnavailable
                    : c.noActiveSpending}
                </p>
              )}
            </div>
          </section>
          <section className={panel} aria-labelledby="expense-register-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="expense-register-title"
                ref={listTitle}
                tabIndex={-1}
                className="text-lg"
              >
                {c.register}
              </h2>
              <div
                className="inline-flex rounded-xl border border-line bg-canvas-sunk p-1"
                role="group"
                aria-label={c.view}
              >
                {(
                  [
                    { value: "table", label: c.table, Icon: List },
                    { value: "cards", label: c.cards, Icon: LayoutGrid },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => changeView(value)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 ${view === value ? "bg-surface text-brand shadow-clay-sm" : "text-ink-muted hover:text-brand"}`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {!page.entries.length ? (
              <div className="py-10 text-center">
                <p className="font-semibold">{c.empty}</p>
                <p className="mt-2 text-sm text-ink-muted">{c.emptyHint}</p>
              </div>
            ) : view === "table" ? (
              <div
                className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line [contain:paint]"
                role="region"
                aria-label={c.tableLabel}
                tabIndex={0}
              >
                <table className="w-full min-w-[40rem] border-collapse text-start text-sm">
                  <caption className="sr-only">{c.register}</caption>
                  <thead className="border-b border-line bg-canvas-sunk text-xs text-ink-muted">
                    <tr>
                      {[
                        c.paidDate,
                        c.category,
                        c.note,
                        c.amount,
                        c.actions,
                      ].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className="px-3 py-3 text-start font-semibold"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {page.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={entry.voided_at ? "text-ink-muted" : ""}
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <time dateTime={entry.entry_date}>
                            {date(entry.entry_date)}
                          </time>
                        </td>
                        <th
                          scope="row"
                          className="px-3 py-2 text-start font-semibold"
                        >
                          {common.categories[entry.category]}
                          {entry.voided_at && (
                            <span className="ms-2 rounded-full bg-canvas-sunk px-2 py-1 text-xs">
                              {c.voided}
                            </span>
                          )}
                        </th>
                        <td className="max-w-sm break-words px-3 py-2 text-ink-muted">
                          {entry.note || c.noNote}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2 font-semibold tabular-nums ${entry.voided_at ? "line-through" : ""}`}
                        >
                          {money(entry.amount)}
                        </td>
                        <td className="px-3 py-2">
                          {!entry.voided_at ? (
                            <button
                              type="button"
                              disabled={busy || loading}
                              className="min-h-11 rounded-xl px-2 font-semibold text-brand underline focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50"
                              onClick={() => {
                                setError("");
                                setVoidEntry(entry);
                              }}
                              aria-label={`${c.voidAction} — ${common.categories[entry.category]}, ${money(entry.amount)}, ${date(entry.entry_date)}`}
                            >
                              {c.voidAction}
                            </button>
                          ) : (
                            <span className="text-xs">{c.voided}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {page.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className={`flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-canvas/40 p-4 ${entry.voided_at ? "text-ink-muted" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {common.categories[entry.category]}
                        </p>
                        <time
                          dateTime={entry.entry_date}
                          className="mt-1 block text-xs text-ink-muted"
                        >
                          {date(entry.entry_date)}
                        </time>
                      </div>
                      <p
                        className={`max-w-full break-words text-base font-bold tabular-nums ${entry.voided_at ? "line-through" : "text-brand"}`}
                      >
                        {money(entry.amount)}
                      </p>
                    </div>
                    <p className="min-w-0 break-words text-sm leading-6 text-ink-muted">
                      {entry.note || c.noNote}
                    </p>
                    <div className="mt-auto flex justify-end border-t border-line pt-1">
                      {!entry.voided_at ? (
                        <button
                          type="button"
                          disabled={busy || loading}
                          className="min-h-11 rounded-xl px-2 text-sm font-semibold text-brand underline focus-visible:ring-4 focus-visible:ring-brand/45 disabled:opacity-50"
                          onClick={() => {
                            setError("");
                            setVoidEntry(entry);
                          }}
                          aria-label={`${c.voidAction} — ${common.categories[entry.category]}, ${money(entry.amount)}, ${date(entry.entry_date)}`}
                        >
                          {c.voidAction}
                        </button>
                      ) : (
                        <span className="inline-flex min-h-11 items-center text-xs">
                          {c.voided}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
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
