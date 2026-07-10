"use client";

import { Cookie } from "lucide-react";
import { useConsent } from "@/components/providers/ConsentProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { asset } from "@/lib/asset";

/**
 * Opt-in tracking banner. Rendered on every page, above everything except the
 * cart drawer (z-[100]). It is not a modal — it must never trap focus or block
 * the page, because a visitor who ignores it is expressing a valid choice
 * (no consent → no pixel).
 */
export function ConsentBanner() {
  const { bannerOpen, grant, deny } = useConsent();
  const { t } = useLocale();

  // No global Escape handler on purpose. This is a non-modal banner, and a
  // document-level Escape listener would also fire when a visitor presses Escape
  // to close the cart drawer (the cart's own handler stops React propagation but
  // not native document events) — silently recording a tracking DENIAL the
  // visitor never chose. Consent must come from an explicit Accept/Decline click.
  if (!bannerOpen) return null;

  return (
    <div
      role="region"
      aria-label={t("consent.title")}
      // z-[95]: above the BackToTop pill (z-[90]) so the two bottom-anchored
      // controls stack deterministically, below the cart drawer (z-[100]).
      className="fixed inset-x-0 bottom-0 z-[95] p-3 sm:p-4"
    >
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-clay-lg border border-line bg-surface p-5 shadow-clay-lg sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-blob bg-canvas-sunk"
          >
            <Cookie className="h-6 w-6 text-clay" />
          </span>

          <div className="flex-1">
            <p className="font-display text-base font-bold text-ink">
              {t("consent.title")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t("consent.body")}{" "}
              <a
                href={asset("/privacy/")}
                className="font-semibold text-brand underline underline-offset-2 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
              >
                {t("consent.learnMore")}
              </a>
            </p>
          </div>

          <div className="flex shrink-0 gap-2.5">
            <ClayButton
              type="button"
              variant="outline"
              onClick={deny}
              className="flex-1 sm:flex-none"
            >
              {t("consent.decline")}
            </ClayButton>
            <ClayButton
              type="button"
              variant="primary"
              onClick={grant}
              className="flex-1 sm:flex-none"
            >
              {t("consent.accept")}
            </ClayButton>
          </div>
        </div>
      </div>
    </div>
  );
}
