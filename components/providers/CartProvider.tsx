"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { ProductId } from "@/lib/products";
import { getProduct, PRODUCTS } from "@/lib/products";
import { STORAGE_CART } from "@/lib/config";

export interface CartLine {
  id: ProductId;
  qty: number;
}

type Action =
  | { type: "ADD"; id: ProductId }
  | { type: "INCREMENT"; id: ProductId }
  | { type: "DECREMENT"; id: ProductId }
  | { type: "REMOVE"; id: ProductId }
  | { type: "CLEAR" }
  | { type: "HYDRATE"; lines: CartLine[] };

const VALID_IDS = new Set(PRODUCTS.map((p) => p.id));
/** Upper bound per line — keeps a stuck "+" (or tampered storage) from runaway qty. */
const MAX_QTY = 99;

function reducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case "HYDRATE": {
      // Persisted JSON is untrusted (older schema, hand-edited, corrupt): keep only
      // well-formed lines, coalesce duplicate ids, floor + clamp each quantity.
      const byId = new Map<ProductId, number>();
      for (const l of action.lines) {
        if (
          l != null &&
          typeof l === "object" &&
          VALID_IDS.has(l.id) &&
          typeof l.qty === "number" &&
          Number.isFinite(l.qty) &&
          l.qty > 0
        ) {
          const next = (byId.get(l.id) ?? 0) + Math.floor(l.qty);
          byId.set(l.id, Math.min(MAX_QTY, next));
        }
      }
      return [...byId].map(([id, qty]) => ({ id, qty }));
    }
    case "ADD": {
      const existing = state.find((l) => l.id === action.id);
      if (existing) {
        return state.map((l) =>
          l.id === action.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l,
        );
      }
      return [...state, { id: action.id, qty: 1 }];
    }
    case "INCREMENT":
      return state.map((l) =>
        l.id === action.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l,
      );
    case "DECREMENT":
      return state
        .map((l) => (l.id === action.id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0);
    case "REMOVE":
      return state.filter((l) => l.id !== action.id);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  /** Cart has at least one priced product → show money UI. */
  hasPrices: boolean;
  subtotal: number;
  add: (id: ProductId) => void;
  increment: (id: ProductId) => void;
  decrement: (id: ProductId) => void;
  remove: (id: ProductId) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, []);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted cart once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_CART);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) dispatch({ type: "HYDRATE", lines: parsed });
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  // Persist on every change (after the initial hydrate).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_CART, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, hydrated]);

  const count = useMemo(() => lines.reduce((n, l) => n + l.qty, 0), [lines]);

  const { hasPrices, subtotal } = useMemo(() => {
    let any = false;
    let sum = 0;
    for (const l of lines) {
      const p = getProduct(l.id);
      if (p?.price != null) {
        any = true;
        sum += p.price * l.qty;
      }
    }
    return { hasPrices: any, subtotal: sum };
  }, [lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count,
      hasPrices,
      subtotal,
      add: (id) => dispatch({ type: "ADD", id }),
      increment: (id) => dispatch({ type: "INCREMENT", id }),
      decrement: (id) => dispatch({ type: "DECREMENT", id }),
      remove: (id) => dispatch({ type: "REMOVE", id }),
      clear: () => dispatch({ type: "CLEAR" }),
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [lines, count, hasPrices, subtotal, isOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
