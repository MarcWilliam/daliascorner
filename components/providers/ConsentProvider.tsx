"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STORAGE_CONSENT } from "@/lib/config";
import { PIXEL_CONFIGURED, setTrackingEnabled, trackPageView } from "@/lib/meta";

export type Consent = "granted" | "denied";

interface ConsentContextValue {
  /** null until the visitor has chosen (or until we've read localStorage). */
  consent: Consent | null;
  /** True once the persisted choice has been read — banner waits on this. */
  hydrated: boolean;
  /** The banner is showing (undecided, or the visitor reopened it). */
  bannerOpen: boolean;
  grant: () => void;
  deny: () => void;
  /** Footer "tracking settings" — lets a visitor change their mind. */
  reopen: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

function read(): Consent | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_CONSENT);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    return null;
  }
}

function persist(value: Consent) {
  try {
    window.localStorage.setItem(STORAGE_CONSENT, value);
  } catch {
    /* private mode — the choice just won't survive a reload */
  }
}

/**
 * Opt-in consent for the Meta Pixel.
 *
 * The pixel is not merely "not fired" before consent — fbevents.js is never
 * requested, because loading it is itself a tracking act (it sets _fbp). Egypt's
 * PDPL (Law 151/2020, executive regulations in force since Nov 2025) requires
 * prior, explicit, revocable consent, and Meta's Business Tools Terms put the
 * duty to obtain it on the business.
 *
 * A visitor with no pixel configured (META_PIXEL_ID = "") never sees the banner.
 */
export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [reopened, setReopened] = useState(false);

  // Adopt the stored choice on mount. A returning "granted" visitor loads the
  // pixel here and gets their PageView; everyone else loads nothing.
  useEffect(() => {
    if (!PIXEL_CONFIGURED) {
      setHydrated(true);
      return;
    }
    const stored = read();
    if (stored === "granted") {
      setTrackingEnabled(true);
      trackPageView();
    }
    setConsent(stored);
    setHydrated(true);
  }, []);

  const grant = useCallback(() => {
    persist("granted");
    setConsent("granted");
    setReopened(false);
    setTrackingEnabled(true);
    trackPageView(); // the visit that earned the consent still counts
  }, []);

  const deny = useCallback(() => {
    persist("denied");
    setConsent("denied");
    setReopened(false);
    setTrackingEnabled(false);
  }, []);

  const reopen = useCallback(() => setReopened(true), []);

  const bannerOpen =
    PIXEL_CONFIGURED && hydrated && (reopened || consent === null);

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, hydrated, bannerOpen, grant, deny, reopen }),
    [consent, hydrated, bannerOpen, grant, deny, reopen],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}
