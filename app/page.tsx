import { HomePage } from "@/components/sections/HomePage";
import { JsonLd } from "@/components/ui/JsonLd";
import { homeJsonLd } from "@/lib/jsonld";

/**
 * Server shell. It exists so the Product and FAQPage JSON-LD land in the static
 * HTML of "/" — and only of "/", where the products and the FAQ are actually
 * visible. Everything interactive lives in <HomePage>, a client component.
 */
export default function Page() {
  return (
    <>
      <JsonLd blocks={homeJsonLd} />
      <HomePage />
    </>
  );
}
