"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * App-level polite live region. Cart add/remove and other async confirmations
 * call announce() so screen readers hear them without stealing focus.
 */
const AnnouncerContext = createContext<(msg: string) => void>(() => {});

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    // Clear then set so identical consecutive messages are still announced.
    setMessage("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(msg), 60);
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer() {
  return useContext(AnnouncerContext);
}
