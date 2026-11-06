"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { STORE_CONFIGURED, storeClient } from "@/lib/store/client";
type Availability = { product_id: string; available: number; price: number };
const Context = createContext<{
  items: Record<string, Availability>;
  loading: boolean;
  refresh: () => Promise<void>;
}>({ items: {}, loading: false, refresh: async () => {} });
export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, Availability>>({});
  const [loading, setLoading] = useState(STORE_CONFIGURED);
  const refresh = useCallback(async () => {
    if (!STORE_CONFIGURED) return;
    try {
      const { data, error } = await storeClient().rpc("store_availability");
      if (error) throw error;
      setItems(
        Object.fromEntries(
          (data as Availability[]).map((i) => [i.product_id, i]),
        ),
      );
    } catch {
      setItems({});
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ items, loading, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useInventory = () => useContext(Context);
