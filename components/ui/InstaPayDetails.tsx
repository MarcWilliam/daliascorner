"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { WhatsAppIcon } from "./BrandIcons";
import { paymentProofWhatsAppLink } from "@/lib/store/payment-proof";
import { useLocale } from "@/components/providers/LocaleProvider";
import {
  validInstaPayLink,
  validInstaPayNumber,
  type InstaPayDetails as Details,
} from "@/lib/store/instapay";
export function InstaPayDetails({
  details,
  legacy = false,
  orderNumber,
}: {
  details: Details;
  legacy?: boolean;
  orderNumber?: number;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">(
    "idle",
  );
  const link = details.instapay_link?.trim() ?? "",
    number = details.instapay_number?.trim() ?? "";
  const hasLink = validInstaPayLink(link),
    hasNumber = validInstaPayNumber(number);
  const proofLink =
    orderNumber === undefined
      ? null
      : paymentProofWhatsAppLink(orderNumber, locale);
  useEffect(() => setCopyState("idle"), [number]);
  return (
    <section
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
      aria-label={ar ? "بيانات إنستا باي" : "InstaPay details"}
    >
      <h3 className="text-base font-semibold">
        {ar ? "الدفع عبر إنستا باي" : "Pay with InstaPay"}
      </h3>
      {hasNumber && (
        <div>
          <p className="text-xs text-ink-muted">
            {ar ? "رقم أو عنوان المستلم" : "Recipient number or address"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span dir="ltr" className="break-all font-semibold">
              {number}
            </span>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(number);
                  setCopyState("done");
                } catch {
                  setCopyState("failed");
                }
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {ar ? "نسخ" : "Copy"}
            </button>
          </div>
          {copyState !== "idle" && (
            <p role="status" className="text-xs text-brand">
              {copyState === "done"
                ? ar
                  ? "تم النسخ"
                  : "Copied"
                : ar
                  ? "انسخ رقم/عنوان المستلم المعروض يدويًا."
                  : "Copy the displayed recipient number/address manually."}
            </p>
          )}
        </div>
      )}
      {hasLink && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-brand px-4 text-sm font-semibold text-brand"
        >
          {ar ? "فتح إنستا باي" : "Open InstaPay"}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      )}
      {!hasLink && !hasNumber && legacy && (
        <p className="text-sm text-ink-muted">
          {ar
            ? "لم تُحفظ بيانات المستلم لهذا الطلب. تواصل مع المتجر لتأكيد بيانات الدفع قبل التحويل."
            : "Recipient details were not saved with this order. Contact the shop to confirm payment details before transferring."}
        </p>
      )}
      {proofLink && (
        <div className="space-y-2 border-t border-line pt-3">
          <a
            href={proofLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-brand px-4 py-2 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
          >
            <WhatsAppIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
            {ar
              ? "إرسال صورة الدفع عبر واتساب"
              : "Send payment screenshot on WhatsApp"}
          </a>
          <p className="text-xs leading-5 text-ink-muted">
            {ar
              ? `تفتح المحادثة برقم طلبك DC-${orderNumber}. أرفق صورة الدفع في واتساب ثم أرسلها.`
              : `WhatsApp opens with your order number DC-${orderNumber}. Attach your payment screenshot there, then send it.`}
          </p>
        </div>
      )}
      <p className="text-xs leading-5 text-ink-muted">
        {ar
          ? "تحقق من اسم المستلم والمبلغ في التطبيق. يؤكد المتجر استلام الدفع بعد وصوله."
          : "Check the recipient and amount in the app. The shop confirms payment after it is received."}
      </p>
    </section>
  );
}
