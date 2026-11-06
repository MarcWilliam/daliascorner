"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { instaPayConfigured, instaPaySettings } from "@/lib/store/instapay";
import { WHATSAPP_NUMBER } from "@/lib/config";
import { AdminDialog } from "./AdminDialog";
type Zone = {
  id: string;
  name_en: string;
  name_ar: string;
  fee: number;
  active: boolean;
};
const field = "store-field mt-1";
const panel = "rounded-2xl border border-line bg-surface p-4 sm:p-5";
export function CheckoutSettings({
  refreshKey = 0,
}: { refreshKey?: number } = {}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const arRef = useRef(ar);
  arRef.current = ar;
  const [zones, setZones] = useState<Zone[]>([]),
    [settings, setSettings] = useState({
      cash_enabled: true,
      transfer_enabled: false,
      instapay_link: "",
      instapay_number: "",
    });
  const [savedMethods, setSavedMethods] = useState({
    cash_enabled: true,
    transfer_enabled: false,
    instapay_link: "",
    instapay_number: "",
  });
  const [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [showZoneForm, setShowZoneForm] = useState(false);
  type ZoneDraft = { en: string; ar: string; fee: string; active: boolean };
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>({
    en: "",
    ar: "",
    fee: "",
    active: true,
  });
  const drafts = useRef<Record<string, ZoneDraft>>({});
  const [zoneError, setZoneError] = useState("");
  const [zoneMessage, setZoneMessage] = useState("");
  const savingZone = useRef(false);
  function openZone(zone?: Zone) {
    const key = zone?.id ?? "new";
    setEditingZone(zone?.id ?? null);
    setZoneDraft(
      drafts.current[key] ?? {
        en: zone?.name_en ?? "",
        ar: zone?.name_ar ?? "",
        fee: zone ? String(zone.fee) : "",
        active: zone?.active ?? true,
      },
    );
    setZoneError("");
    setShowZoneForm(true);
  }
  function updateZoneDraft(next: Partial<ZoneDraft>) {
    setZoneDraft((current) => {
      const updated = { ...current, ...next };
      drafts.current[editingZone ?? "new"] = updated;
      return updated;
    });
  }
  function closeZoneForm() {
    if (savingZone.current) return;
    setShowZoneForm(false);
    setZoneError("");
  }
  const load = useCallback(async (preservePaymentDraft = false) => {
    setLoading(true);
    try {
      const db = storeClient();
      const [z, s] = await Promise.all([
        db.from("delivery_zones").select("*").order("name_en"),
        db.from("checkout_settings").select("*").single(),
      ]);
      if (z.error || s.error) throw Error();
      setZones(z.data);
      if (!preservePaymentDraft)
        setSettings({
          cash_enabled: s.data.cash_enabled,
          transfer_enabled: s.data.transfer_enabled,
          instapay_link: s.data.instapay_link ?? "",
          instapay_number: s.data.instapay_number ?? "",
        });
      setSavedMethods(s.data);
      setReady(true);
      return true;
    } catch {
      setError(
        arRef.current
          ? "تعذر تحميل الإعدادات. حاول مرة أخرى."
          : "Unable to load settings. Please try again.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  async function save(
    fn: () => PromiseLike<{ error: unknown }>,
    paymentSettings = false,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fn();
      if (r.error) throw r.error;
      const refreshed = await load(!paymentSettings);
      setMessage(
        refreshed
          ? ar
            ? "تم الحفظ"
            : "Saved"
          : ar
            ? "تم الحفظ. حدّث الصفحة لعرض الإعدادات الجديدة."
            : "Saved. Refresh to load the latest settings.",
      );
      return true;
    } catch {
      setError(
        ar
          ? "تعذر الحفظ. بياناتك لم تُمسح، حاول مرة أخرى."
          : "Unable to save. Your entries have been kept; please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const paused =
    !zones.some((z) => z.active) ||
    (!savedMethods.cash_enabled &&
      !(savedMethods.transfer_enabled && instaPayConfigured(savedMethods)));
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {ready && (
          <p
            className={`inline-flex items-center gap-2 font-medium ${paused ? "text-destructive" : "text-brand"}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${paused ? "bg-destructive" : "bg-brand"}`}
            />
            {paused
              ? ar
                ? "الطلبات متوقفة: فعّل منطقة وطريقة دفع."
                : "Checkout paused: enable a zone and payment method."
              : ar
                ? "الموقع يستقبل الطلبات"
                : "Checkout accepting orders"}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm text-brand">
            {message}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-3">
            <p className="text-sm font-semibold">{error}</p>
            {!ready && (
              <ClayButton
                variant="outline"
                className="mt-3"
                disabled={loading}
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                {ar ? "إعادة المحاولة" : "Try again"}
              </ClayButton>
            )}
          </div>
        )}
        {loading && !ready && (
          <p role="status" className="mt-4">
            {ar ? "جارٍ تحميل الإعدادات…" : "Loading settings…"}
          </p>
        )}
      </div>
      {ready && (
        <>
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">
                {ar ? "مناطق التوصيل" : "Delivery zones"}
              </h2>
              <ClayButton
                type="button"
                variant="outline"
                disabled={busy || loading}
                onClick={() => openZone()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {ar ? "إضافة منطقة" : "Add zone"}
              </ClayButton>
            </div>
            {zoneMessage && (
              <p role="status" className="mt-2 text-sm text-brand">
                {zoneMessage}
              </p>
            )}
            <ul className="mt-3 divide-y divide-line">
              {zones.map((zone) => (
                <li
                  key={zone.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start">
                    <bdi
                      className="max-w-full break-words font-semibold"
                      lang={ar ? "ar" : "en"}
                      dir={ar ? "rtl" : "ltr"}
                    >
                      {ar ? zone.name_ar : zone.name_en}
                    </bdi>
                    <bdi
                      className="max-w-full break-words text-xs text-ink-muted"
                      lang={ar ? "en" : "ar"}
                      dir={ar ? "ltr" : "rtl"}
                    >
                      {ar ? zone.name_en : zone.name_ar}
                    </bdi>
                  </div>
                  <span className="text-sm tabular whitespace-nowrap">
                    {zone.fee} EGP
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-xs ${zone.active ? "bg-leaf-soft text-brand" : "bg-canvas-sunk text-ink-muted"}`}
                  >
                    {zone.active
                      ? ar
                        ? "مفعّلة"
                        : "Active"
                      : ar
                        ? "متوقفة"
                        : "Paused"}
                  </span>
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => openZone(zone)}
                    aria-label={`${ar ? "تعديل" : "Edit"} — ${ar ? zone.name_ar : zone.name_en}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand hover:bg-canvas-sunk focus-visible:ring-4 focus-visible:ring-brand/35 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {ar ? "تعديل" : "Edit"}
                  </button>
                </li>
              ))}
            </ul>
            {!zones.length && (
              <p className="py-4 text-sm text-ink-muted">
                {ar
                  ? "أضف أول منطقة توصيل للبدء."
                  : "Add your first delivery zone to get started."}
              </p>
            )}
          </section>
          <AdminDialog
            open={showZoneForm}
            onClose={closeZoneForm}
            busy={busy || loading}
            title={
              editingZone
                ? ar
                  ? "تعديل منطقة التوصيل"
                  : "Edit delivery zone"
                : ar
                  ? "إضافة منطقة توصيل"
                  : "Add delivery zone"
            }
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (savingZone.current || busy || loading) return;
                setZoneError("");
                const values = {
                  name_en: zoneDraft.en.trim(),
                  name_ar: zoneDraft.ar.trim(),
                  fee: Number(zoneDraft.fee),
                  active: zoneDraft.active,
                };
                if (
                  !values.name_en ||
                  !values.name_ar ||
                  !zoneDraft.fee.trim() ||
                  !Number.isFinite(values.fee) ||
                  values.fee < 0 ||
                  values.fee > 10000
                ) {
                  setZoneError(
                    ar
                      ? "أدخل الاسمين ورسومًا من 0 إلى 10000 جنيه."
                      : "Enter both names and a fee between 0 and 10,000 EGP.",
                  );
                  return;
                }
                savingZone.current = true;
                const key = editingZone ?? "new";
                void save(() =>
                  editingZone
                    ? storeClient()
                        .from("delivery_zones")
                        .update(values)
                        .eq("id", editingZone)
                    : storeClient().from("delivery_zones").insert(values),
                )
                  .then((ok) => {
                    if (ok) {
                      delete drafts.current[key];
                      setShowZoneForm(false);
                      setZoneMessage(
                        ar ? "تم حفظ منطقة التوصيل." : "Delivery zone saved.",
                      );
                    } else
                      setZoneError(
                        ar
                          ? "تعذر الحفظ. بياناتك محفوظة؛ حاول مجددًا."
                          : "Could not save. Your entries have been kept; try again.",
                      );
                  })
                  .finally(() => {
                    savingZone.current = false;
                  });
              }}
            >
              <fieldset disabled={busy || loading} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    English
                    <input
                      autoFocus
                      className={field}
                      name="en"
                      dir="ltr"
                      required
                      maxLength={100}
                      value={zoneDraft.en}
                      onChange={(e) => updateZoneDraft({ en: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    العربية
                    <input
                      className={field}
                      name="ar"
                      dir="rtl"
                      required
                      maxLength={100}
                      value={zoneDraft.ar}
                      onChange={(e) => updateZoneDraft({ ar: e.target.value })}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  {ar ? "رسوم التوصيل EGP" : "Delivery fee EGP"}
                  <input
                    className={field}
                    name="fee"
                    type="number"
                    min={0}
                    max={10000}
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={zoneDraft.fee}
                    onChange={(e) => updateZoneDraft({ fee: e.target.value })}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    className="h-5 w-5 accent-brand"
                    checked={zoneDraft.active}
                    onChange={(e) =>
                      updateZoneDraft({ active: e.target.checked })
                    }
                  />
                  {ar
                    ? "متاحة للعملاء عند الدفع"
                    : "Available to customers at checkout"}
                </label>
                {zoneError && (
                  <p
                    role="alert"
                    className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {zoneError}
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-line pt-4">
                  <ClayButton
                    type="button"
                    variant="outline"
                    onClick={closeZoneForm}
                  >
                    {ar ? "إلغاء" : "Cancel"}
                  </ClayButton>
                  <ClayButton type="submit">
                    {busy
                      ? ar
                        ? "جارٍ الحفظ…"
                        : "Saving…"
                      : ar
                        ? "حفظ المنطقة"
                        : "Save zone"}
                  </ClayButton>
                </div>
              </fieldset>
            </form>
          </AdminDialog>
          <section className={panel}>
            <h2 className="text-lg">{ar ? "طرق الدفع" : "Payment methods"}</h2>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                let recipient;
                try {
                  recipient = instaPaySettings(settings);
                } catch (error) {
                  setError(
                    error instanceof Error &&
                      error.message === "INVALID_INSTAPAY_LINK"
                      ? ar
                        ? "استخدم رابط إنستا باي آمنًا يبدأ بـ https://ipn.eg/."
                        : "Use an InstaPay payment link beginning with https://ipn.eg/."
                      : ar
                        ? "أدخل رقم هاتف مصري أو عنوانًا صالحًا مثل name@instapay."
                        : "Enter an Egyptian mobile number or an address such as name@instapay.",
                  );
                  return;
                }
                if (
                  settings.transfer_enabled &&
                  !instaPayConfigured(recipient)
                ) {
                  setError(
                    ar
                      ? "أضف رابط الدفع أو رقم/عنوان المستلم لتفعيل إنستا باي."
                      : "Add an InstaPay payment link or recipient number/address before enabling it.",
                  );
                  return;
                }
                void save(
                  () =>
                    storeClient()
                      .from("checkout_settings")
                      .update({
                        ...settings,
                        ...recipient,
                      })
                      .eq("id", true),
                  true,
                );
              }}
            >
              <fieldset disabled={busy || loading} className="space-y-3">
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand"
                    checked={settings.cash_enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cash_enabled: e.target.checked,
                      })
                    }
                  />
                  {ar ? "الدفع عند الاستلام" : "Cash on delivery"}
                </label>
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand"
                    checked={settings.transfer_enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        transfer_enabled: e.target.checked,
                      })
                    }
                  />
                  {ar ? "إنستا باي" : "InstaPay"}
                </label>
                {settings.transfer_enabled && !instaPayConfigured(settings) && (
                  <p
                    role="status"
                    className="rounded-xl bg-orange/20 p-3 text-sm"
                  >
                    {ar
                      ? "أضف رابط الدفع أو بيانات المستلم لتفعيل إنستا باي عند الدفع."
                      : "Add a payment link or recipient to enable InstaPay at checkout."}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    {ar ? "رابط دفع إنستا باي" : "InstaPay payment link"}
                    <input
                      className={field}
                      type="url"
                      dir="ltr"
                      maxLength={2048}
                      placeholder="https://ipn.eg/..."
                      value={settings.instapay_link}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          instapay_link: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    {ar
                      ? "رقم أو عنوان مستلم إنستا باي"
                      : "InstaPay recipient number or address"}
                    <input
                      className={field}
                      type="text"
                      dir="ltr"
                      maxLength={110}
                      placeholder="01012345678 or name@instapay"
                      value={settings.instapay_number}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          instapay_number: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <p className="text-xs leading-5 text-ink-muted">
                  {ar
                    ? "استخدم رقم الاستلام/عنوان IPA أو رابطًا من إنستا باي. التغييرات للطلبات الجديدة."
                    : "Use your receiving mobile/IPA or a link copied from InstaPay. Changes apply to new orders."}
                </p>
                <p className="border-t border-line pt-3 text-xs leading-5 text-ink-muted">
                  {ar
                    ? "صور الدفع عبر واتساب المتجر: "
                    : "Payment screenshots go to shop WhatsApp: "}
                  <span dir="ltr" className="inline-block font-medium text-ink">
                    +{WHATSAPP_NUMBER}
                  </span>
                  .
                  {ar
                    ? " تحقق من وصول المبلغ قبل تحديد الطلب كمدفوع."
                    : " Verify receipt before marking an order paid."}
                </p>
                {!settings.cash_enabled && !settings.transfer_enabled && (
                  <p className="rounded-xl bg-orange/20 p-3 text-sm">
                    {ar
                      ? "حفظ هذه الإعدادات يوقف الطلبات حتى تفعيل طريقة دفع."
                      : "Saving with both methods off pauses checkout until a payment method is enabled."}
                  </p>
                )}
                <ClayButton type="submit">
                  {busy
                    ? ar
                      ? "جارٍ الحفظ…"
                      : "Saving…"
                    : ar
                      ? "حفظ إعدادات الدفع"
                      : "Save payment settings"}
                </ClayButton>
              </fieldset>
            </form>
          </section>
        </>
      )}
    </section>
  );
}
