"use client";
import { useState } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import type { Locale } from "@/lib/i18n/types";
import {
  customerOrderMessageLink,
  customerWhatsAppNumber,
  orderMessage,
  orderMessageTemplates,
  type OrderMessageTemplate,
} from "@/lib/store/order-messages";

type Props = {
  orderNumber: number;
  phone: string;
  customerName?: string;
  locale?: Locale;
  status?: string;
  busy?: boolean;
};
export function AdminOrderMessages(props: Props) {
  return (
    <MessageEditor key={`${props.orderNumber}:${props.phone}`} {...props} />
  );
}
function MessageEditor({
  orderNumber,
  phone,
  locale: orderLocale,
  status,
  busy = false,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [language, setLanguage] = useState<Locale>(orderLocale ?? locale);
  const [template, setTemplate] = useState<OrderMessageTemplate>(
    status === "shipped"
      ? "on_the_way"
      : status === "delivered"
        ? "delivered"
        : status === "cancelled"
          ? "cancelled"
          : "confirmed",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const key = `${language}:${template}`,
    message = drafts[key] ?? orderMessage(template, orderNumber, language);
  const link = customerOrderMessageLink(phone, message);
  const labels: Record<OrderMessageTemplate, string> = ar
    ? {
        confirmed: "تأكيد الطلب",
        on_the_way: "الطلب في الطريق",
        delivered: "بعد التسليم",
        payment_reminder: "تذكير بالدفع",
        cancelled: "إلغاء الطلب",
      }
    : {
        confirmed: "Order confirmed",
        on_the_way: "On the way",
        delivered: "Delivered",
        payment_reminder: "Payment reminder",
        cancelled: "Order cancelled",
      };
  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-canvas/50 p-4"
      aria-label={ar ? "رسالة للعميل عبر واتساب" : "Customer WhatsApp message"}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <WhatsAppIcon aria-hidden="true" className="h-5 w-5" />
        {ar ? "راسل العميل" : "Message customer"}
      </h3>
      <fieldset
        disabled={busy}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"
      >
        <label className="min-w-0 text-xs text-ink-muted">
          {ar ? "الرسالة" : "Template"}
          <select
            className="store-field mt-1"
            value={template}
            onChange={(e) =>
              setTemplate(e.target.value as OrderMessageTemplate)
            }
          >
            {orderMessageTemplates.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          {ar ? "اللغة" : "Language"}
          <select
            className="store-field mt-1"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <label className="col-span-2 text-xs text-ink-muted">
          {ar ? "راجع الرسالة وعدّلها" : "Review and edit message"}
          <textarea
            dir={language === "ar" ? "rtl" : "ltr"}
            className="store-field mt-1"
            rows={4}
            maxLength={4000}
            value={message}
            onChange={(e) =>
              setDrafts((previous) => ({ ...previous, [key]: e.target.value }))
            }
          />
        </label>
      </fieldset>
      {!customerWhatsAppNumber(phone) && (
        <p role="status" className="text-sm text-destructive">
          {ar
            ? "رقم هاتف العميل غير صالح لواتساب. تحقق من الرقم قبل الإرسال."
            : "The customer phone number is not valid for WhatsApp. Check the number before sending."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {link && !busy ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-brand px-4 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35"
          >
            <WhatsAppIcon aria-hidden="true" className="h-4 w-4" />
            {ar ? "فتح واتساب" : "Open WhatsApp"}
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="min-h-12 rounded-xl border border-line px-4 text-sm text-ink-muted opacity-50"
          >
            {ar ? "فتح واتساب" : "Open WhatsApp"}
          </button>
        )}
        <bdi dir="ltr" className="break-all text-xs text-ink-muted">
          {phone}
        </bdi>
      </div>
      <p className="text-xs leading-5 text-ink-muted">
        {ar
          ? "تفتح الرسالة في واتساب لمراجعتها وإرسالها. لا تُرسل تلقائيًا ولا تغيّر حالة الطلب."
          : "Opens a draft in WhatsApp for you to review and send. Nothing is sent automatically, and the order status stays unchanged."}
      </p>
    </section>
  );
}
