"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isSaleActive, SALE_START, SALE_END } from "@/lib/promotion";

const PromotionContext = createContext(false);

/** The build snapshot avoids hydration mismatches; the browser owns live expiry. */
export function PromotionProvider({ initialActive, children }: {
  initialActive: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(initialActive);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setActive(isSaleActive());
      const next = [Date.parse(SALE_START), Date.parse(SALE_END)]
        .find((time) => time > Date.now());
      if (next) timer = setTimeout(refresh, Math.min(next - Date.now(), 2147483647));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <PromotionContext.Provider value={active}>{children}</PromotionContext.Provider>;
}

export const useSaleActive = () => useContext(PromotionContext);
