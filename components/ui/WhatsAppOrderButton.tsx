"use client";

import { useCart } from "@/components/providers/CartProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { ClayButton } from "@/components/ui/ClayButton";
import { whatsappLink } from "@/lib/config";
import { trackCheckoutLead, trackContact } from "@/lib/meta";
import { buildOrderLink } from "@/lib/whatsapp";

interface WhatsAppOrderButtonProps {
  className?: string;
}

/**
 * A cart-aware order CTA. An existing cart is always sent as a localized order
 * message; the generic WhatsApp chat is used only when the cart is empty.
 */
export function WhatsAppOrderButton({
  className = "",
}: WhatsAppOrderButtonProps) {
  const { lines } = useCart();
  const { locale, messages, t } = useLocale();
  const hasItems = lines.length > 0;
  const href = hasItems
    ? buildOrderLink(lines, locale, messages)
    : whatsappLink();

  function handleClick() {
    if (hasItems) {
      void trackCheckoutLead(lines, { name: "", phone: "" });
      return;
    }
    trackContact("whatsapp");
  }

  return (
    <ClayButton
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="whatsapp"
      className={className}
      onClick={handleClick}
    >
      <WhatsAppIcon className="h-5 w-5" />
      {hasItems ? t("cart.checkout") : t("nav.orderWhatsapp")}
    </ClayButton>
  );
}
