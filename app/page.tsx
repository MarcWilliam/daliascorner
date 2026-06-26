"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Characters } from "@/components/sections/Characters";
import { WhyUs } from "@/components/sections/WhyUs";
import { HowToOrder } from "@/components/sections/HowToOrder";
import { Faq } from "@/components/sections/Faq";
import { Footer } from "@/components/sections/Footer";
import { CartDrawer } from "@/components/sections/CartDrawer";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { BackToTop } from "@/components/ui/BackToTop";

export default function Home() {
  const { t } = useLocale();
  return (
    <>
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[200] focus:rounded-clay focus:bg-brand focus:px-4 focus:py-2 focus:font-display focus:font-semibold focus:text-canvas focus:shadow-clay"
      >
        {t("nav.skip")}
      </a>

      <ScrollProgress />
      <Nav />

      <main id="main">
        <Hero />
        <Characters />
        <HowToOrder />
        <About />
        <WhyUs />
        <Faq />
      </main>

      <Footer />
      <CartDrawer />
      <BackToTop />
    </>
  );
}
