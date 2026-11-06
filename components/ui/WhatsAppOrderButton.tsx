"use client";

import { useCart } from "@/components/providers/CartProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { ClayButton } from "@/components/ui/ClayButton";
import { whatsappLink } from "@/lib/config";
import { trackContact } from "@/lib/meta";

interface WhatsAppOrderButtonProps {
  className?: string;
}

/**
 * A populated cart must use the saved-order checkout. Empty carts open chat.
 */
export function WhatsAppOrderButton({
  className = "",
}: WhatsAppOrderButtonProps) {
  const { lines, open } = useCart();
  const { t } = useLocale();
  const hasItems = lines.length > 0;
  if (hasItems)
    return (
      <ClayButton variant="whatsapp" className={className} onClick={open}>
        <WhatsAppIcon className="h-5 w-5" />
        {t("cart.checkout")}
      </ClayButton>
    );

  return (
    <ClayButton
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      variant="whatsapp"
      className={className}
      onClick={() => trackContact("whatsapp")}
    >
      <WhatsAppIcon className="h-5 w-5" />
      {t("nav.orderWhatsapp")}
    </ClayButton>
  );
}
