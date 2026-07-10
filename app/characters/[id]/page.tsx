import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/sections/ProductDetail";
import { JsonLd } from "@/components/ui/JsonLd";
import { productJsonLd } from "@/lib/jsonld";
import { getProduct, PRODUCTS, type ProductId } from "@/lib/products";
import { DEFAULT_LOCALE, productPath } from "@/lib/config";
import { asset } from "@/lib/asset";

/**
 * Three characters, three pages. Nothing else is ever emitted, so there is no
 * need for `dynamicParams = false` — and setting it breaks `next dev`, which
 * reads that as fallbackMode:false and refuses to render the route at all
 * (see base-server.js: `fallbackMode !== "static"` → throw). The production
 * export takes a different code path and never noticed.
 */
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const product = getProduct(params.id as ProductId);
  if (!product) return {};

  // The static HTML of every page is pre-rendered in DEFAULT_LOCALE, so the
  // metadata a crawler reads must be written in that language too.
  const loc = DEFAULT_LOCALE;
  const title = `${product.name[loc]} — Dalia's Corner`;
  const path = asset(productPath(product.id));

  return {
    title,
    description: product.blurb[loc],
    alternates: {
      canonical: path,
      // Single-URL client toggle → both locales resolve to the same path.
      languages: { ar: path, en: path, "x-default": path },
    },
    openGraph: {
      type: "website",
      siteName: "Dalia's Corner",
      title,
      description: product.blurb[loc],
      url: path,
      locale: "ar_EG",
      alternateLocale: ["en_US"],
      images: [
        {
          url: product.image,
          width: 800,
          height: 800,
          type: "image/webp",
          alt: product.alt[loc],
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: product.blurb[loc],
      images: [{ url: product.image, alt: product.alt[loc] }],
    },
  };
}

export default function CharacterPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id as ProductId);
  if (!product) notFound();

  return (
    <>
      <JsonLd blocks={productJsonLd(product)} />
      <ProductDetail product={product} />
    </>
  );
}
