import type { Metadata, Viewport } from "next";
import { Baloo_2, Baloo_Bhaijaan_2, Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import {
  DEFAULT_LOCALE,
  ENABLE_BROWSER_LOCALE_DETECTION,
  NO_TRANSLATE_ID,
  STORAGE_LOCALE,
} from "@/lib/config";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { jsonLdBlocks } from "@/lib/jsonld";
import { asset } from "@/lib/asset";

const def = dictionaries[DEFAULT_LOCALE];
const initialDir = DEFAULT_LOCALE === "ar" ? "rtl" : "ltr";

// Self-hosted via next/font: the woff2 ship same-origin (no render-blocking
// fonts.googleapis.com round-trip) and each family gets a metric-matched
// fallback (adjustFontFallback default) so the swap doesn't reflow. Display
// faces only carry the weights actually used (600/700/800); 400/500 dropped.
// CSS vars are consumed by --font-display / --font-body in globals.css.
//
// Baloo 2 is the *Latin* display face — only used once the visitor switches to
// English. The default render is Arabic (Baloo Bhaijaan 2 + Cairo), so this
// file is dead weight on the first paint. preload:false keeps it self-hosted
// but drops its <link rel=preload>, so its 34KB no longer competes with the
// hero (the LCP element) for the throttled mobile pipe. It still loads on
// demand via font-display:swap, and the metric-matched fallback means no CLS.
const baloo2 = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo2",
  display: "swap",
  preload: false,
});
const balooBhaijaan2 = Baloo_Bhaijaan_2({
  subsets: ["arabic"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo-bhaijaan2",
  display: "swap",
});
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});
const fontVars = `${baloo2.variable} ${balooBhaijaan2.variable} ${cairo.variable}`;

// Deploy target. Production serves from the custom apex domain at root (basePath
// empty); asset() prefixes /public URLs for any non-root subpath preview deploy.
const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://daliascorner.com";
const home = asset("/");
// Real raster share image (1200×630) — social platforms ignore SVG OG images.
const ogImage = asset("/og.png");

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: def.meta.title,
  description: def.meta.description,
  applicationName: "Dalia's Corner",
  manifest: asset("/manifest.webmanifest"),
  alternates: {
    canonical: home,
    // Single-URL client toggle → both locales resolve to the home path.
    languages: {
      ar: home,
      en: home,
      "x-default": home,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Dalia's Corner",
    title: def.meta.title,
    description: def.meta.description,
    url: home,
    locale: "ar_EG",
    alternateLocale: ["en_US"],
    // Branded 1200×630 PNG share card (public/og.png).
    images: [
      { url: ogImage, width: 1200, height: 630, type: "image/png", alt: "Dalia's Corner" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: def.meta.title,
    description: def.meta.description,
    images: [{ url: ogImage, alt: "Dalia's Corner" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF6EC",
};

// Resolve the locale before first paint (stored pref → browser language → default)
// and apply <html lang/dir> to avoid a direction flash. The site is statically
// pre-rendered in DEFAULT_LOCALE, so when the resolved locale differs, the first
// paint still shows baseline-language text until React swaps it — flag the page
// `notranslate` so the browser doesn't sample that text and offer to translate a
// page we're about to render in the user's own language. Set via JS, so no-JS
// visitors (who never get the swap) keep native translation available.
const NO_FLASH =
  `(function(){try{` +
  `var def=${JSON.stringify(DEFAULT_LOCALE)},` +
  `detect=${JSON.stringify(ENABLE_BROWSER_LOCALE_DETECTION)},` +
  `key=${JSON.stringify(STORAGE_LOCALE)},` +
  `id=${JSON.stringify(NO_TRANSLATE_ID)};` +
  `var s=null;try{s=localStorage.getItem(key)}catch(e){}` +
  `var l=(s==='ar'||s==='en')?s:(detect?((navigator.language||'').toLowerCase().indexOf('ar')===0?'ar':'en'):def);` +
  `var e=document.documentElement;e.lang=l;e.dir=(l==='ar')?'rtl':'ltr';` +
  `if(l!==def){e.setAttribute('translate','no');` +
  `if(!document.getElementById(id)){var m=document.createElement('meta');m.id=id;m.name='google';m.content='notranslate';(document.head||e).appendChild(m)}}` +
  `}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE} dir={initialDir} className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        {/* Structured data (Organization, WebSite, Product ×3, FAQPage). Server-
            rendered into the static HTML so AI answer-engines and search crawlers
            read the brand facts in English without executing JS. */}
        {jsonLdBlocks.map((block, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
          />
        ))}
        {/* No-JS fallback: the hero uses on-load entrance animation (initial hidden);
            force its content visible when scripting is disabled. Scroll reveals
            handle this themselves by rendering visibly until mounted. */}
        <noscript>
          <style>{`#top *{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
