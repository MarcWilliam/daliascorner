import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { DEFAULT_LOCALE } from "@/lib/config";
import { dictionaries } from "@/lib/i18n/dictionaries";

const def = dictionaries[DEFAULT_LOCALE];
const initialDir = DEFAULT_LOCALE === "ar" ? "rtl" : "ltr";

export const metadata: Metadata = {
  // TODO: set the real production URL once deployed.
  metadataBase: new URL("https://daliascorner.example"),
  title: def.meta.title,
  description: def.meta.description,
  applicationName: "Dalia's Corner",
  alternates: {
    canonical: "/",
    // Single-URL client toggle → both locales resolve to "/".
    languages: {
      ar: "/",
      en: "/",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    siteName: "Dalia's Corner",
    title: def.meta.title,
    description: def.meta.description,
    locale: "ar_EG",
    alternateLocale: ["en_US"],
    // PLACEHOLDER OG image — swap /og.svg for a real 1200×630 brand image.
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "Dalia's Corner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: def.meta.title,
    description: def.meta.description,
    images: ["/og.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF6EC",
};

// Set <html lang/dir> before paint from the stored preference (avoids FOUC of direction).
const NO_FLASH = `(function(){try{var d=${JSON.stringify(DEFAULT_LOCALE)};var s=localStorage.getItem('dalias-corner.locale');var l=(s==='ar'||s==='en')?s:(navigator.language||'').toLowerCase().indexOf('ar')===0?'ar':(s?s:d);var e=document.documentElement;e.lang=l;e.dir=(l==='ar')?'rtl':'ltr';}catch(_){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE} dir={initialDir} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&family=Baloo+Bhaijaan+2:wght@400;500;600;700;800&family=Cairo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
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
