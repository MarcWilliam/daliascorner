"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { Logo } from "@/components/ui/Logo";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { CartButton } from "@/components/ui/CartButton";
import { ClayButton } from "@/components/ui/ClayButton";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { whatsappLink } from "@/lib/config";
import { asset } from "@/lib/asset";
import { trackContact } from "@/lib/meta";

/**
 * Header for the pages that aren't the one-pager. The main <Nav> is built from
 * in-page anchors (#characters, #faq…) which point at nothing here, so these
 * routes get a reduced bar: brand → home, language, cart, and the order CTA.
 */
export function MiniNav() {
  const { t } = useLocale();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <nav
        aria-label={t("nav.label")}
        className="container-page flex items-center justify-between gap-3 py-3"
      >
        <a
          href={asset("/")}
          className="flex items-center gap-3 rounded-clay focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
          aria-label="Dalia's Corner"
        >
          <Logo alt="" className="h-12 w-12 sm:h-14 sm:w-14" />
        </a>

        <div className="flex items-center gap-2">
          {/* Always visible — unlike the main Nav, MiniNav has no hamburger menu
              to carry a fallback toggle, so hiding it below xs (≈360–399px, a
              large share of phones) would strand these pages in one language. */}
          <LanguageToggle />
          <CartButton />
          <ClayButton
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            variant="whatsapp"
            className="hidden md:inline-flex"
            onClick={() => trackContact("whatsapp")}
          >
            <WhatsAppIcon className="h-5 w-5" />
            {t("nav.orderWhatsapp")}
          </ClayButton>
        </div>
      </nav>
    </header>
  );
}
