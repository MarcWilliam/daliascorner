import type { ExpenseCategory } from "./finance-copy";

export type ExpenseStatus = "active" | "voided" | "all";
export type ExpenseFilters = {
  from: string;
  to: string;
  category: ExpenseCategory | "all";
  search: string;
  status: ExpenseStatus;
};
export type ExpenseEntry = {
  id: string;
  entry_date: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  voided_at: string | null;
  created_at: string;
};
export type ExpensePage = {
  entries: ExpenseEntry[];
  total_count: number;
  active_count: number;
  voided_count: number;
  active_total: number;
  category_totals?: {
    category: ExpenseCategory;
    amount: number;
    count: number;
  }[];
  voided_total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};
export const EXPENSE_PAGE_SIZE = 25;
export const defaultExpenseFilters = (): ExpenseFilters => ({
  from: "",
  to: "",
  category: "all",
  search: "",
  status: "active",
});
export function expensePageArgs(filters: ExpenseFilters, offset: number) {
  return {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_category: filters.category === "all" ? null : filters.category,
    p_search: filters.search.trim(),
    p_status: filters.status,
    p_offset: offset,
    p_limit: EXPENSE_PAGE_SIZE,
  };
}
