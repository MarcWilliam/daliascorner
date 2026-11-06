"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { storeClient } from "@/lib/store/client";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import type { Locale } from "@/lib/i18n/types";
import {
  customerOrderMessageLink,
  customerWhatsAppNumber,
  orderMessage,
  orderMessageTemplates,
  type OrderMessageTemplate,
} from "@/lib/store/order-messages";

type Props = {
  orderId: string;
  orderNumber: number;
  phone: string;
  customerName?: string;
  locale?: Locale;
  status?: string;
  busy?: boolean;
};
export function AdminOrderMessages(props: Props) {
  const { session } = useCustomerAuth();
  return (
    <MessageEditor
      key={`${session?.user.id}:${props.orderId}:${props.phone}`}
      {...props}
    />
  );
}
function MessageEditor({
  orderId,
  orderNumber,
  phone,
  locale: orderLocale,
  status,
  busy = false,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [orderLink, setOrderLink] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setOrderLink("");
    setLinkError(false);
    void (async () => {
      try {
        const { data, error } = await storeClient()
          .rpc("create_order_share_link", { p_id: orderId })
          .abortSignal(controller.signal);
        if (!active) return;
        if (
          error ||
          typeof data !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            data,
          )
        )
          throw Error();
        const url = new URL("/order/", window.location.origin);
        url.hash = "order=" + data;
        setOrderLink(url.toString());
      } catch {
        if (active) setLinkError(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId, retry]);
  const [languageOverride, setLanguageOverride] = useState<Locale | null>(null);
  // Follow the saved checkout language even if it arrives after the editor mounts.
  // An explicit admin choice remains in effect across order/payment refreshes.
  const language = languageOverride ?? orderLocale ?? locale;
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
    message =
      drafts[key] ?? orderMessage(template, orderNumber, language, orderLink);
  const link = orderLink ? customerOrderMessageLink(phone, message) : null;
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
      <p className="text-xs text-ink-muted">
        {ar ? "لغة العميل عند الطلب: " : "Customer language at checkout: "}
        <span className="font-semibold text-ink">
          {orderLocale === "ar"
            ? "العربية"
            : orderLocale === "en"
              ? "English"
              : ar
                ? "غير مسجلة"
                : "Not recorded"}
        </span>
      </p>
      <fieldset
        disabled={busy || !orderLink}
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
            onChange={(e) => setLanguageOverride(e.target.value as Locale)}
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
      {orderLink && (
        <p className="text-xs text-ink-muted">
          {ar
            ? "يتضمن النص رابطًا خاصًا بالطلب صالحًا لمدة ٩٠ يومًا. شاركه مع هذا العميل فقط."
            : "Includes a private order link valid for 90 days. Share it only with this customer."}
        </p>
      )}
      {!orderLink && (
        <p role="status" className="text-xs text-ink-muted">
          {linkError
            ? ar
              ? "تعذر إنشاء رابط الطلب."
              : "Could not prepare the order link."
            : ar
              ? "جارٍ تجهيز رابط الطلب…"
              : "Preparing the order link…"}
          {linkError && (
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="ms-2 min-h-11 font-semibold text-brand underline"
            >
              {ar ? "إعادة المحاولة" : "Retry order link"}
            </button>
          )}
        </p>
      )}
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
