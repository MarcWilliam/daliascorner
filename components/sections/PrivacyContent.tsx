"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useConsent } from "@/components/providers/ConsentProvider";
import { MiniNav } from "@/components/sections/MiniNav";
import { Footer } from "@/components/sections/Footer";
import { CartDrawer } from "@/components/sections/CartDrawer";
import { ClayButton } from "@/components/ui/ClayButton";
import { WhatsAppIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { INSTAGRAM_DM_URL, whatsappLink } from "@/lib/config";
import { asset } from "@/lib/asset";
import { PIXEL_CONFIGURED } from "@/lib/meta";

export function PrivacyContent() {
  const { t, messages } = useLocale();
  const { reopen } = useConsent();

  return (
    <>
      <MiniNav />

      <main id="main">
        <div className="section">
          <div className="container-page">
            <a
              href={asset("/")}
              className="inline-flex items-center gap-2 rounded-clay py-2 font-display text-sm font-semibold text-ink-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
            >
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              {t("privacy.backHome")}
            </a>

            <div className="mx-auto mt-6 max-w-2xl">
              <h1 className="text-3xl sm:text-4xl">{t("privacy.title")}</h1>
              <p className="mt-2 text-sm text-ink-muted">{t("privacy.updated")}</p>
              <p className="mt-6 text-lg leading-relaxed text-ink-muted">
                {t("privacy.intro")}
              </p>

              {messages.privacy.sections.map((section) => (
                <section key={section.h} className="mt-10">
                  <h2 className="text-xl sm:text-2xl">{section.h}</h2>
                  <p className="mt-3 leading-relaxed text-ink-muted">{section.p}</p>
                  {section.items.length > 0 && (
                    <ul className="mt-4 space-y-2.5">
                      {section.items.map((item) => (
                        <li
                          key={item}
                          className="flex gap-3 leading-relaxed text-ink-muted"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              {/* The consent control has to be reachable from the policy itself —
                  withdrawing must be as easy as granting. */}
              {PIXEL_CONFIGURED && (
                <div className="mt-10 rounded-clay-lg border border-line bg-canvas-sunk p-6">
                  <p className="font-display text-lg font-bold text-ink">
                    {t("footer.trackingSettings")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {t("consent.body")}
                  </p>
                  <ClayButton
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={reopen}
                  >
                    {t("footer.trackingSettings")}
                  </ClayButton>
                </div>
              )}

              <div className="mt-10 rounded-clay-lg border border-line bg-surface p-6 shadow-clay-sm">
                <h2 className="text-xl sm:text-2xl">{t("privacy.contactTitle")}</h2>
                <p className="mt-3 leading-relaxed text-ink-muted">
                  {t("privacy.contactBody")}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ClayButton
                    href={whatsappLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="whatsapp"
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                    {t("footer.whatsapp")}
                  </ClayButton>
                  <ClayButton
                    href={INSTAGRAM_DM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="accent"
                  >
                    <InstagramIcon className="h-5 w-5" />
                    {t("footer.instagram")}
                  </ClayButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <CartDrawer />
    </>
  );
}
