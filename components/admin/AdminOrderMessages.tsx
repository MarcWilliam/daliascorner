"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { storeClient } from "@/lib/store/client";
import type { Locale } from "@/lib/i18n/types";
import {
  customerOrderMessageLink,
  customerWhatsAppNumber,
  orderMessage,
  type OrderMessageTemplate,
} from "@/lib/store/order-messages";

export type MessageDraft = { language: Locale; text: string };

export function useAdminOrderLink(orderId: string, owner: string, requested: boolean) {
  const [result, setResult] = useState<{ owner: string; link: string; failed: boolean }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    setResult(undefined);
    void (async () => {
      try {
        const { data, error } = await storeClient()
          .rpc("create_order_share_link", { p_id: orderId })
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error || typeof data !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data)) {
          throw Error();
        }
        const url = new URL("/order/", window.location.origin);
        url.hash = "order=" + data;
        setResult({ owner, link: url.toString(), failed: false });
      } catch {
        if (!controller.signal.aborted) setResult({ owner, link: "", failed: true });
      }
    })();
    return () => controller.abort();
  }, [orderId, owner, requested, attempt]);
  return {
    url: result?.owner === owner ? result.link : "",
    failed: result?.owner === owner && result.failed,
    retry: () => setAttempt((value) => value + 1),
  };
}

type Props = {
  orderNumber: number;
  phone: string;
  orderLocale?: Locale;
  template: OrderMessageTemplate;
  orderLink: ReturnType<typeof useAdminOrderLink>;
  beforeSave?: boolean;
  busy?: boolean;
  initialDraft?: MessageDraft;
};

const button = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-40";

export function AdminOrderMessages({
  orderNumber, phone, orderLocale, template, orderLink, beforeSave, busy, initialDraft,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [override, setOverride] = useState<Locale | undefined>(initialDraft?.language);
  const [drafts, setDrafts] = useState<Partial<Record<Locale, string>>>(
    initialDraft ? { [initialDraft.language]: initialDraft.text } : {},
  );
  const language = override ?? orderLocale ?? locale;
  const message = drafts[language] ?? orderMessage(template, orderNumber, language, orderLink.url);
  const validPhone = customerWhatsAppNumber(phone);
  const link = orderLink.url && customerOrderMessageLink(phone, message);

  return (
    <section className="space-y-2 rounded-xl border border-line bg-canvas/50 p-3" aria-label={ar ? "مسودة واتساب" : "WhatsApp draft"}>
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <WhatsAppIcon aria-hidden="true" className="h-4 w-4" />
        {template === "payment_reminder"
          ? ar ? "تذكير بالدفع" : "Payment reminder"
          : ar ? "مسودة واتساب" : "WhatsApp draft"}
      </h4>
      {!validPhone ? (
        <p className="text-sm text-ink-muted">{ar ? "تحقق من رقم العميل في بيانات الطلب." : "Check the customer’s WhatsApp number in the order details."}</p>
      ) : !orderLink.url ? (
        <p role="status" className="text-sm text-ink-muted">
          {orderLink.failed
            ? ar ? "تعذر تجهيز رابط الطلب." : "Could not prepare the order link."
            : ar ? "جارٍ تجهيز رابط الطلب…" : "Preparing the order link…"}
          {orderLink.failed && (
            <button type="button" onClick={orderLink.retry} className="ms-2 min-h-11 text-brand underline">
              {ar ? "إعادة المحاولة" : "Retry"}
            </button>
          )}
        </p>
      ) : (
        <>
          <label className="block text-xs text-ink-muted">
            {ar ? "لغة الرسالة" : "Message language"}
            <select name={beforeSave ? "whatsapp_language" : undefined} className="store-field mt-1 max-w-40" value={language} onChange={(event) => setOverride(event.target.value as Locale)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label className="block text-xs text-ink-muted">
            {ar ? "راجع الرسالة وعدّلها" : "Review and edit message"}
            <textarea
              name={beforeSave ? "whatsapp_message" : undefined}
              dir={language === "ar" ? "rtl" : "ltr"}
              className="store-field mt-1"
              rows={4}
              maxLength={4000}
              value={message}
              onChange={(event) => setDrafts((previous) => ({ ...previous, [language]: event.target.value }))}
            />
          </label>
          {beforeSave ? (
            <button type="submit" name="open_whatsapp" disabled={busy || !link} className={button}>
              {ar ? "حفظ وفتح واتساب" : "Save & open WhatsApp"}
            </button>
          ) : link && !busy ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={button}>
              {ar ? "فتح واتساب" : "Open WhatsApp"}
            </a>
          ) : (
            <button type="button" disabled className={button}>{ar ? "فتح واتساب" : "Open WhatsApp"}</button>
          )}
          <p className="text-xs text-ink-muted">
            {ar ? "راجع المسودة وأرسلها من واتساب." : "Review and send the draft in WhatsApp."}
          </p>
        </>
      )}
    </section>
  );
}
