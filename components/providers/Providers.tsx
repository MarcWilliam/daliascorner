"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import { LocaleProvider } from "./LocaleProvider";
import { AnnouncerProvider } from "./Announcer";
import { CartProvider } from "./CartProvider";
import { DeviceTiltProvider } from "./DeviceTiltProvider";

/**
 * Single client boundary: locale + cart + a11y announcer.
 * LazyMotion(domAnimation) loads only the feature set we use (animations,
 * variants, exit, hover, whileInView) — paired with `m.*` components instead of
 * `motion.*` it trims the Framer Motion bundle.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <LocaleProvider>
        <AnnouncerProvider>
          <CartProvider>
            <DeviceTiltProvider>{children}</DeviceTiltProvider>
          </CartProvider>
        </AnnouncerProvider>
      </LocaleProvider>
    </LazyMotion>
  );
}
