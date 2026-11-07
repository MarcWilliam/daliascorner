"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { cairoDay } from "@/lib/store/manual-order-history";
import {
  remainingUnits,
  type OrderAdjustmentDetail,
} from "@/lib/store/order-adjustments";

type Submit = (
  action: string,
  build: (form: HTMLFormElement) => Record<string, unknown>,
  reset?: boolean,
) => (event: FormEvent<HTMLFormElement>) => Promise<void>;
type Props = {
  preset?: { action?: string; sequence: number };
  detail: OrderAdjustmentDetail;
  disabled: boolean;
  submit: Submit;
  reason: () => ReactNode;
  previewMessage: (action: string) => ReactNode;
};
type Option = {
  id: string;
  label: string;
  hint?: string;
  fields?: ReactNode;
  payload?: (form: HTMLFormElement) => Record<string, unknown>;
};
const field = "store-field mt-1";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-canvas focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-40";
const text = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? "").trim();
function suggestedReservationDeadline(expiresAt?: string) {
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  const current = Math.max(now, Date.parse(expiresAt ?? "") || 0);
  const deadline = Math.min(current + 24 * hour, now + 30 * 24 * hour - 60_000);
  if (deadline <= current) return "";
  const date = new Date(deadline);
  return new Date(deadline - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-sm">
      {label}
      {children}
    </label>
  );
}
export function CorrectionActions({
  preset,
  detail,
  disabled,
  submit,
  reason,
  previewMessage,
}: Props) {
  const { locale } = useLocale(),
    ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [selected, setSelected] = useState(preset?.action ?? "");
  useEffect(() => {
    if (preset?.sequence) setSelected(preset.action ?? "");
  }, [preset?.sequence]);
  const o = detail.order,
    finance = detail.finance;
  const shipped = detail.items.some((item) => item.shipped_quantity > 0);
  const outstanding = detail.items.some((item) => remainingUnits(item) > 0);
  const closed = ["cancelled", "expired"].includes(o.status);
  const canConfirm =
    o.status === "pending" &&
    (Number(finance?.net_collected) > 0 ||
      !o.expires_at ||
      Date.parse(o.expires_at) > Date.now());
  const undoable = detail.items.some((item) => item.returned_quantity > 0)
    ? []
    : detail.shipments.filter(
        (s) => !s.voided_at && !s.delivered_on && !s.legacy_delivered,
      );
  const options: Option[] = [];
  if (canConfirm)
    options.push({ id: "confirm", label: t("Confirm order", "تأكيد الطلب") });
  if (!closed && outstanding)
    options.push({
      id: "cancel",
      label: shipped
        ? t("Cancel remaining items", "إلغاء المنتجات المتبقية")
        : t("Cancel order", "إلغاء الطلب"),
      hint: t(
        "Releases the outstanding holds. Record any actual refund separately.",
        "يحرّر حجز المنتجات المتبقية. سجّل أي رد مالي فعلي منفصلًا.",
      ),
    });
  if (closed && !shipped && !o.is_historical)
    options.push({
      id: "reopen",
      label: t("Reopen order", "إعادة فتح الطلب"),
      hint: t(
        "Checks stock again before reserving the items.",
        "يتحقق من المخزون مجددًا قبل حجز المنتجات.",
      ),
    });
  if (o.status === "pending")
    options.push({
      id: "extend",
      label: t("Extend reservation", "تمديد الحجز"),
      fields: (
        <Field
          label={t(
            "New deadline (device time)",
            "نهاية الحجز الجديدة (بتوقيت جهازك)",
          )}
        >
          <input
            className={field}
            name="expires"
            type="datetime-local"
            defaultValue={suggestedReservationDeadline(o.expires_at)}
            required
          />
        </Field>
      ),
      payload: (form) => ({
        expires_at: new Date(text(form, "expires")).toISOString(),
      }),
    });
  options.push({
    id: "order_date",
    label: t("Correct order date", "تصحيح تاريخ الطلب"),
    fields: (
      <Field
        label={t("Original order date (Cairo)", "تاريخ الطلب الأصلي (القاهرة)")}
      >
        <input
          className={field}
          name="ordered_on"
          type="date"
          defaultValue={
            o.ordered_at
              ? new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Africa/Cairo",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date(o.ordered_at))
              : ""
          }
          max={cairoDay()}
          required
        />
      </Field>
    ),
    payload: (form) => ({ ordered_on: text(form, "ordered_on") }),
  });
  if (undoable.length)
    options.push({
      id: "undo_shipment",
      label: t("Undo mistaken shipment", "التراجع عن شحنة مسجلة بالخطأ"),
      fields: (
        <>
          <Field label={t("Shipment", "الشحنة")}>
            <select
              className={field}
              name="shipment_id"
              required
              defaultValue={undoable.length === 1 ? undoable[0].id : ""}
            >
              <option value="">{t("Choose a shipment", "اختر الشحنة")}</option>
              {undoable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.courier || t("Shipment", "شحنة")} ·{" "}
                  {s.tracking_number || s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              className="mt-1 h-5 w-5 accent-brand"
              type="checkbox"
              name="confirmed_not_dispatched"
              required
            />
            {t(
              "The products never left the shop.",
              "المنتجات لم تغادر المتجر.",
            )}
          </label>
        </>
      ),
      payload: (form) => ({
        shipment_id: text(form, "shipment_id"),
        confirmed_not_dispatched: new FormData(form).has(
          "confirmed_not_dispatched",
        ),
      }),
    });
  const active = options.some((option) => option.id === selected)
    ? selected
    : "";
  return (
    <>
      <h3 className="font-semibold">{t("Order actions", "إجراءات الطلب")}</h3>
      <Field label={t("Choose an action", "اختر إجراءً")}>
        <select
          className={field}
          value={active}
          disabled={disabled}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{t("Select an action", "حدّد الإجراء")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      {options.map((option) => (
        <form
          key={option.id}
          hidden={active !== option.id}
          onSubmit={submit(option.id, option.payload ?? (() => ({})))}
        >
          <fieldset
            disabled={disabled || active !== option.id}
            className="space-y-3 border-t border-line pt-3"
          >
            {option.hint && (
              <p className="text-xs text-ink-muted">{option.hint}</p>
            )}
            {option.fields}
            {reason()}
            <button className={button} type="submit">
              {option.label}
            </button>
            {previewMessage(option.id)}
          </fieldset>
        </form>
      ))}
    </>
  );
}
