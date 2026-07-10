"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Logo } from "@/components/ui/Logo";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { CartButton } from "@/components/ui/CartButton";
import { ClayButton } from "@/components/ui/ClayButton";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { whatsappLink } from "@/lib/config";
import { trackContact } from "@/lib/meta";

const LINKS = [
  { id: "characters", href: "#characters", key: "nav.characters" },
  { id: "order", href: "#order", key: "nav.order" },
  { id: "story", href: "#story", key: "nav.story" },
  { id: "why", href: "#why", key: "nav.why" },
  { id: "faq", href: "#faq", key: "nav.faq" },
] as const;

export function Nav() {
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);

  // Scroll-spy: highlight the section currently in view (nav-state-active).
  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      Boolean,
    ) as HTMLElement[];
    if (!sections.length) return;
    // Track each section's visibility so we can pick the most-visible one — and
    // clear the highlight entirely when none is within the spy band (e.g. at the
    // hero or footer), instead of leaving a stale section marked current.
    const ratios = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let topId = "";
        let topRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > topRatio) {
            topRatio = ratio;
            topId = id;
          }
        }
        setActive(topId);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  // Close mobile menu on Escape; return focus to the burger.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        burgerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <nav
        aria-label={t("nav.label")}
        className="container-page flex items-center justify-between gap-3 py-3"
      >
        {/* Leading: logo tile + wordmark */}
        <a
          href="#top"
          className="flex items-center gap-3 rounded-clay focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
          aria-label="Dalia's Corner"
        >
          {/* Full brand lockup — already includes the wordmark + tagline. */}
          <Logo alt="" className="h-12 w-12 sm:h-14 sm:w-14" />
        </a>

        {/* Center: text links (desktop) */}
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={l.href}
                aria-current={active === l.id ? "true" : undefined}
                className={`rounded-clay px-3.5 py-2 font-display text-[0.95rem] font-semibold transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 ${
                  active === l.id ? "bg-canvas-sunk text-brand" : "text-ink"
                }`}
              >
                {t(l.key)}
              </a>
            </li>
          ))}
        </ul>

        {/* Trailing: language + cart + order CTA + burger */}
        <div className="flex items-center gap-2">
          <LanguageToggle className="hidden xs:inline-flex" />
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

          <button
            ref={burgerRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            className="inline-grid h-11 w-11 place-items-center rounded-clay border-2 border-line bg-surface text-brand shadow-clay-sm transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation] cursor-pointer lg:hidden"
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="container-page pb-5 lg:hidden"
        >
          <ul className="flex flex-col gap-1 rounded-clay-lg border border-line bg-surface p-3 shadow-clay">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active === l.id ? "true" : undefined}
                  className={`block rounded-clay px-4 py-3 font-display text-base font-semibold transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 ${
                    active === l.id ? "bg-canvas-sunk text-brand" : "text-ink"
                  }`}
                >
                  {t(l.key)}
                </a>
              </li>
            ))}
            <li className="mt-2 flex items-center gap-2">
              <LanguageToggle className="flex-1 justify-center xs:hidden" />
            </li>
            <li className="mt-1">
              <ClayButton
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                variant="whatsapp"
                className="w-full"
                onClick={() => trackContact("whatsapp")}
              >
                <WhatsAppIcon className="h-5 w-5" />
                {t("nav.orderWhatsapp")}
              </ClayButton>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
