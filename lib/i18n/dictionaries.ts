import en from "./en.json";
import ar from "./ar.json";
import type { Locale } from "./types";

/** The English dictionary defines the shape; Arabic must match it. */
export type Messages = typeof en;

export const dictionaries: Record<Locale, Messages> = {
  en,
  ar: ar as Messages,
};

export { en, ar };
