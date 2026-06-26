"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Locale } from "@/lib/i18n/types";
import { dictionaries, type Messages } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_LOCALE,
  ENABLE_BROWSER_LOCALE_DETECTION,
  NO_TRANSLATE_ID,
  STORAGE_LOCALE,
} from "@/lib/config";

type Dir = "rtl" | "ltr";

interface LocaleContextValue {
  locale: Locale;
  dir: Dir;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  /** Resolve a dotted key into a string, with {var} interpolation. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** The full message object for the active locale (for arrays/structured copy). */
  messages: Messages;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolve(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function dirFor(locale: Locale): Dir {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Sync <html lang/dir> to the active locale and toggle the browser-translate
 * opt-out. The static export pre-renders DEFAULT_LOCALE, so until React swaps the
 * text the first paint is in the baseline language. When the active locale isn't
 * the baseline, suppress translation so the browser doesn't offer to translate a
 * page the app itself renders in the user's language; restore it otherwise (e.g.
 * a non-baseline reader who toggled back, who may genuinely want translation).
 */
function applyHtmlLocale(locale: Locale) {
  const el = document.documentElement;
  el.lang = locale;
  el.dir = dirFor(locale);

  const suppress = locale !== DEFAULT_LOCALE;
  const meta = document.getElementById(NO_TRANSLATE_ID);
  if (suppress) {
    el.setAttribute("translate", "no");
    if (!meta) {
      const m = document.createElement("meta");
      m.id = NO_TRANSLATE_ID;
      m.name = "google";
      m.content = "notranslate";
      document.head.appendChild(m);
    }
  } else {
    el.removeAttribute("translate");
    meta?.remove();
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Server + first client render use DEFAULT_LOCALE to match the SSR'd <html>.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // After mount, adopt the stored / detected preference (avoids hydration mismatch).
  useEffect(() => {
    let next: Locale | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_LOCALE);
      if (stored === "ar" || stored === "en") next = stored;
    } catch {
      /* ignore */
    }
    if (!next && ENABLE_BROWSER_LOCALE_DETECTION) {
      const nav = navigator.language?.toLowerCase() ?? "";
      next = nav.startsWith("ar") ? "ar" : "en";
    }
    if (next && next !== locale) setLocaleState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <html lang/dir> + translate opt-out in sync when the locale changes.
  // Skip the first run: the pre-paint inline script in app/layout.tsx already
  // applied the resolved locale to <html>, and on mount `locale` is still the
  // SSR default (DEFAULT_LOCALE) until the effect above adopts the real one —
  // running now would clobber the inline state and briefly re-expose the
  // translate prompt before the content swaps.
  const htmlSynced = useRef(false);
  useEffect(() => {
    if (!htmlSynced.current) {
      htmlSynced.current = true;
      return;
    }
    applyHtmlLocale(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_LOCALE, l);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "ar" ? "en" : "ar");
  }, [locale, setLocale]);

  const messages = dictionaries[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = resolve(messages, key);
      let str = typeof raw === "string" ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [messages],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: dirFor(locale), setLocale, toggleLocale, t, messages }),
    [locale, setLocale, toggleLocale, t, messages],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
