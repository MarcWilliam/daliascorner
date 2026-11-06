"use client";

import { InventoryProvider } from "./InventoryProvider";
import { PromotionProvider } from "./PromotionProvider";
import { LazyMotion, domAnimation } from "framer-motion";
import { LocaleProvider } from "./LocaleProvider";
import { AnnouncerProvider } from "./Announcer";
import { CartProvider } from "./CartProvider";
import { ConsentProvider } from "./ConsentProvider";
import { DeviceTiltProvider } from "./DeviceTiltProvider";
import { ConsentBanner } from "@/components/ui/ConsentBanner";

/**
 * Single client boundary: locale + consent + cart + a11y announcer.
 * LazyMotion(domAnimation) loads only the feature set we use (animations,
 * variants, exit, hover, whileInView) — paired with `m.*` components instead of
 * `motion.*` it trims the Framer Motion bundle.
 *
 * ConsentProvider wraps CartProvider because the cart fires Meta Pixel events,
 * and those must stay no-ops until the visitor has opted in.
 */
export function Providers({
  children,
  saleActive,
}: {
  children: React.ReactNode;
  saleActive: boolean;
}) {
  return (
    <LazyMotion features={domAnimation} strict>
      <LocaleProvider>
        <AnnouncerProvider>
          <ConsentProvider>
            <PromotionProvider initialActive={saleActive}>
              <InventoryProvider>
                <CartProvider>
                  <DeviceTiltProvider>{children}</DeviceTiltProvider>
                  <ConsentBanner />
                </CartProvider>
              </InventoryProvider>
            </PromotionProvider>
          </ConsentProvider>
        </AnnouncerProvider>
      </LocaleProvider>
    </LazyMotion>
  );
}
