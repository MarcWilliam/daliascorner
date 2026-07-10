import type { Metadata } from "next";
import { PrivacyContent } from "@/components/sections/PrivacyContent";
import { DEFAULT_LOCALE } from "@/lib/config";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { asset } from "@/lib/asset";

const def = dictionaries[DEFAULT_LOCALE];
const path = asset("/privacy/");

export const metadata: Metadata = {
  title: `${def.privacy.title} — Dalia's Corner`,
  description: def.privacy.intro,
  alternates: {
    canonical: path,
    languages: { ar: path, en: path, "x-default": path },
  },
  // A privacy notice has no business in search results or in an AI answer about
  // the brand; it exists for the visitor who goes looking for it.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
