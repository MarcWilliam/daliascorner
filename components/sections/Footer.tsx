"use client";

import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";
import { LogoTile, Wordmark } from "@/components/ui/Logo";
import { Blob } from "@/components/ui/Blob";
import { WhatsAppIcon, InstagramIcon, FacebookIcon } from "@/components/ui/BrandIcons";
import { useParallaxPair } from "@/lib/parallax";
import {
  FACEBOOK_URL,
  INSTAGRAM_URL,
  WHATSAPP_NUMBER,
} from "@/lib/config";

export function Footer() {
  const { t } = useLocale();
  const reduce = useReducedMotion();

  const ref = useRef<HTMLElement | null>(null);
  const { down, up } = useParallaxPair(ref, 36);

  const socials = [
    {
      href: INSTAGRAM_URL,
      label: t("footer.instagram"),
      Icon: InstagramIcon,
    },
    {
      href: `https://wa.me/${WHATSAPP_NUMBER}`,
      label: t("footer.whatsapp"),
      Icon: WhatsAppIcon,
    },
    // Facebook only renders if a URL is supplied (placeholder empty by default).
    ...(FACEBOOK_URL
      ? [{ href: FACEBOOK_URL, label: t("footer.facebook"), Icon: FacebookIcon }]
      : []),
  ];

  return (
    <footer
      ref={ref}
      className="relative overflow-hidden border-t border-line bg-brand text-canvas"
    >
      {/* tonal parallax depth — darker-green + leaf blobs drifting against each other */}
      <Blob
        className="start-[-5rem] top-[-2rem] h-56 w-56 text-brand-deep opacity-50"
        style={reduce ? undefined : { y: down }}
      />
      <Blob
        className="end-[-5rem] bottom-[-3rem] h-64 w-64 text-leaf opacity-20"
        style={reduce ? undefined : { y: up }}
      />

      <div className="relative container-page flex flex-col items-center gap-7 py-12 text-center">
        <div className="flex items-center gap-3">
          <LogoTile className="bg-canvas/15" />
          <span className="font-display text-2xl font-extrabold tracking-tight text-canvas">
            Dalia&apos;s Corner
          </span>
        </div>

        <p className="font-display text-lg font-semibold text-canvas/95">
          {t("footer.tagline")}
        </p>

        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-canvas/70">
            {t("footer.follow")}
          </span>
          <ul className="flex items-center gap-3">
            {socials.map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid h-12 w-12 place-items-center rounded-clay bg-canvas/12 text-canvas transition-colors hover:bg-canvas/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-canvas/50 [touch-action:manipulation]"
                >
                  <Icon className="h-6 w-6" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-2 text-sm text-canvas/80">{t("footer.madeWith")}</p>
      </div>
    </footer>
  );
}
