import type { Locale } from "../i18n/types";

export const orderMessageTemplates = [
  "confirmed",
  "on_the_way",
  "delivered",
  "payment_reminder",
  "cancelled",
] as const;
export type OrderMessageTemplate = (typeof orderMessageTemplates)[number];

/** Accept formatted Egyptian mobiles or explicitly international E.164 numbers. */
export function customerWhatsAppNumber(value: string): string | null {
  const raw = value
    .trim()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
  if (!raw || /[^0-9+ ()-]/.test(raw)) return null;
  const compact = raw.replace(/[ ()-]/g, "");
  if (/^01[0125][0-9]{8}$/.test(compact)) return "20" + compact.slice(1);
  if (/^201[0125][0-9]{8}$/.test(compact)) return compact;
  const international = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : "";
  if (international.startsWith("20"))
    return /^201[0125][0-9]{8}$/.test(international) ? international : null;
  return /^[1-9][0-9]{6,14}$/.test(international) ? international : null;
}

export function orderMessage(
  template: OrderMessageTemplate,
  orderNumber: number,
  locale: Locale,
  orderLink?: string,
): string {
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) return "";
  const reference = `DC-${orderNumber}`;
  const messages =
    locale === "ar"
      ? {
          confirmed: `تم تأكيد طلبك ${reference} من Dalia’s Corner. سنخبرك عندما يكون في الطريق إليك.`,
          on_the_way: `طلبك ${reference} من Dalia’s Corner في الطريق إليك. شكرًا لاختيارك لنا!`,
          delivered: `نتمنى أن يكون طلبك ${reference} من Dalia’s Corner وصل بالسلامة وأن يعجبك. شكرًا لدعمك!`,
          payment_reminder: `تذكير بخصوص دفع طلبك ${reference} من Dalia’s Corner. إذا كنت قد دفعت بالفعل، أرسل لنا صورة الدفع لنراجعها.`,
          cancelled: `تم إلغاء طلبك ${reference} من Dalia’s Corner. إذا كان لديك أي استفسار أو سبق لك الدفع، تواصل معنا لنساعدك.`,
        }
      : {
          confirmed: `Your Dalia’s Corner order ${reference} is confirmed. We’ll let you know when it’s on the way.`,
          on_the_way: `Your Dalia’s Corner order ${reference} is on the way. Thank you for choosing us!`,
          delivered: `We hope your Dalia’s Corner order ${reference} arrived safely and you love it. Thank you for your support!`,
          payment_reminder: `A reminder about payment for your Dalia’s Corner order ${reference}. If you’ve already paid, please send us the payment screenshot so we can check it.`,
          cancelled: `Your Dalia’s Corner order ${reference} has been cancelled. If you have questions or have already paid, please message us so we can help.`,
        };
  return (
    messages[template] +
    (orderLink
      ? `\n\n${locale === "ar" ? "تابع طلبك:" : "Track your order:"}\n${orderLink}`
      : "")
  );
}

export function customerOrderMessageLink(
  phone: string,
  message: string,
): string | null {
  const number = customerWhatsAppNumber(phone);
  if (!number || !message.trim() || message.length > 4000) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
