import type { MetadataRoute } from "next";
import { PRODUCTS } from "@/lib/products";
import { SITE_ORIGIN, productUrl } from "@/lib/config";

export const dynamic = "force-static";

/**
 * Replaces the old hand-written public/sitemap.xml so the character pages can
 * never be forgotten when a product is added to lib/products.ts.
 *
 * Both locales live at the same URL (an in-page toggle, no /en route), so every
 * entry declares itself as its own ar / en / x-default alternate.
 */
const bilingual = (url: string) => ({
  ar: url,
  en: url,
  "x-default": url,
});

export default function sitemap(): MetadataRoute.Sitemap {
  const home = `${SITE_ORIGIN}/`;

  return [
    {
      url: home,
      changeFrequency: "monthly",
      priority: 1,
      alternates: { languages: bilingual(home) },
    },
    ...PRODUCTS.map((p) => {
      const url = productUrl(p.id);
      return {
        url,
        changeFrequency: "monthly" as const,
        priority: 0.8,
        alternates: { languages: bilingual(url) },
      };
    }),
  ];
}
