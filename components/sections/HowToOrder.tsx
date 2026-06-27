"use client";

import { Camera, ShoppingBag } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useCart } from "@/components/providers/CartProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { RichText } from "@/components/ui/RichText";
import { RevealTitle } from "@/components/ui/RevealTitle";
import { RevealGroup, RevealItem } from "@/components/ui/RevealGroup";
import { WhatsAppIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { FloatingLeaf } from "@/components/ui/FloatingLeaf";
import { INSTAGRAM_URL, whatsappLink } from "@/lib/config";

export function HowToOrder() {
  const { t } = useLocale();
  const { open } = useCart();

  return (
    <section
      id="order"
      className="section relative isolate scroll-mt-24 overflow-hidden"
    >
      <FloatingLeaf className="end-[6%] top-8 h-16 w-11" />
      <FloatingLeaf className="start-[7%] bottom-8 h-20 w-14 motion-safe:[animation-delay:-3s]" />

      <div className="container-page">
        <RevealTitle className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">
            <RichText text={t("order.title")} accentClassName="text-clay-deep" />
          </h2>
        </RevealTitle>

        <RevealGroup className="grid gap-6 lg:grid-cols-2">
          {/* Path 1 — cart + WhatsApp (primary) */}
          <RevealItem className="h-full">
            <div className="flex h-full flex-col gap-4 rounded-clay-lg border-2 border-brand/25 bg-surface p-6 shadow-clay sm:p-8">
              <span className="grid h-14 w-14 place-items-center rounded-clay bg-leaf-soft">
                <ShoppingBag className="h-7 w-7 text-brand" aria-hidden="true" />
              </span>
              <h3 className="text-2xl">{t("order.primaryTitle")}</h3>
              <p className="flex-1 text-lg leading-relaxed text-ink-muted">
                {t("order.primaryBody")}
              </p>
              <div className="flex flex-wrap gap-3">
                <ClayButton href="#characters" variant="primary">
                  {t("order.primaryCta")}
                </ClayButton>
                <ClayButton variant="outline" onClick={open} type="button">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  {t("cart.title")}
                </ClayButton>
              </div>
            </div>
          </RevealItem>

          {/* Path 2 — screenshot & DM (alternative) */}
          <RevealItem className="h-full">
            <div className="flex h-full flex-col gap-4 rounded-clay-lg border border-line bg-canvas-sunk p-6 shadow-clay-sm sm:p-8">
              <span className="grid h-14 w-14 place-items-center rounded-clay bg-mauve-soft">
                <Camera className="h-7 w-7 text-ink" aria-hidden="true" />
              </span>
              <h3 className="text-2xl">{t("order.altHeading")}</h3>
              <p className="flex-1 text-lg leading-relaxed text-ink-muted">
                {t("order.altBody")}
              </p>
              <div className="flex flex-wrap gap-3">
                <ClayButton
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="accent"
                >
                  <InstagramIcon className="h-5 w-5" />
                  {t("order.altInstagram")}
                </ClayButton>
                <ClayButton
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {t("order.altWhatsapp")}
                </ClayButton>
              </div>
            </div>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}
