"use client";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
export function CustomerAccountButton() {
  const { session, signIn } = useCustomerAuth();
  const { locale, t } = useLocale();
  const className =
    "inline-flex min-h-12 items-center rounded-clay px-2 text-brand text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return session ? (
    <a href="/account/" className={className}>
      {t("nav.account")}
    </a>
  ) : (
    <button type="button" className={className} onClick={signIn}>
      {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
    </button>
  );
}
