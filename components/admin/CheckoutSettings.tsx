"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { instaPayConfigured, instaPaySettings } from "@/lib/store/instapay";
import { WHATSAPP_NUMBER } from "@/lib/config";
type Zone = {
  id: string;
  name_en: string;
  name_ar: string;
  fee: number;
  active: boolean;
};
const field = "store-field mt-1";
const panel =
  "rounded-clay-lg border border-line bg-surface p-5 shadow-clay-sm sm:p-6";
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
  const [zoneDraft, setZoneDraft] = useState({ en: "", ar: "", fee: "" });
  const [zoneError, setZoneError] = useState("");
  const [zoneMessage, setZoneMessage] = useState("");
  const addZoneButton = useRef<HTMLButtonElement>(null);
  const zoneNameInput = useRef<HTMLInputElement>(null);
  const addingZone = useRef(false);
  useEffect(() => {
    if (showZoneForm) zoneNameInput.current?.focus();
  }, [showZoneForm]);
  function closeZoneForm() {
    setShowZoneForm(false);
    setZoneError("");
    requestAnimationFrame(() => addZoneButton.current?.focus());
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
  function zoneValues(form: HTMLFormElement) {
    const f = new FormData(form);
    return {
      name_en: String(f.get("en") ?? "").trim(),
      name_ar: String(f.get("ar") ?? "").trim(),
      fee: Number(f.get("fee")),
      active: f.get("active") === "on",
    };
  }
  function validZone(v: ReturnType<typeof zoneValues>) {
    if (
      !v.name_en ||
      !v.name_ar ||
      !Number.isFinite(v.fee) ||
      v.fee < 0 ||
      v.fee > 10000
    ) {
      setError(
        ar
          ? "أدخل اسم المنطقة باللغتين ورسومًا من 0 إلى 10000 جنيه."
          : "Enter both zone names and a delivery fee between 0 and 10,000 EGP.",
      );
      return false;
    }
    return true;
  }
  const paused =
    !zones.some((z) => z.active) ||
    (!savedMethods.cash_enabled &&
      !(savedMethods.transfer_enabled && instaPayConfigured(savedMethods)));
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className={panel}>
        <h2 className="text-xl">
          {ar ? "التوصيل والدفع" : "Delivery & payment"}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {ar
            ? "اختر مناطق التوصيل والرسوم وطرق الدفع التي تظهر عند إتمام الطلب."
            : "Choose the delivery areas, fees and payment methods customers see at checkout."}
        </p>
        {ready && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${paused ? "bg-orange/20" : "bg-leaf-soft"}`}
          >
            {paused
              ? ar
                ? "الطلبات متوقفة: فعّل منطقة توصيل وطريقة دفع واحدة على الأقل."
                : "Checkout is paused: enable at least one delivery zone and one payment method."
              : ar
                ? "الموقع جاهز لاستقبال الطلبات."
                : "Website checkout is accepting orders."}
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
                ref={addZoneButton}
                type="button"
                variant="outline"
                disabled={busy || loading}
                aria-expanded={showZoneForm}
                aria-controls="add-delivery-zone-form"
                onClick={() => {
                  setZoneMessage("");
                  setZoneError("");
                  setShowZoneForm(true);
                  requestAnimationFrame(() => zoneNameInput.current?.focus());
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {ar ? "إضافة منطقة" : "Add zone"}
              </ClayButton>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {ar
                ? "المناطق المفعّلة فقط تظهر للعملاء. أوقف أي منطقة مؤقتًا دون حذفها."
                : "Only active zones appear to customers. Pause a zone at any time without deleting it."}
            </p>
            {zoneMessage && (
              <p
                role="status"
                className="mt-3 rounded-xl bg-leaf-soft p-3 text-sm font-semibold text-brand"
              >
                {zoneMessage}
              </p>
            )}
            <div className="mt-4 divide-y divide-line">
              {zones.map((z) => (
                <form
                  key={`${z.id}-${z.name_en}-${z.name_ar}-${z.fee}-${z.active}`}
                  className="py-4 first:pt-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = zoneValues(e.currentTarget);
                    if (validZone(v))
                      void save(() =>
                        storeClient()
                          .from("delivery_zones")
                          .update(v)
                          .eq("id", z.id),
                      );
                  }}
                >
                  <fieldset
                    disabled={busy || loading}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <label className="text-sm">
                      English
                      <input
                        className={field}
                        name="en"
                        defaultValue={z.name_en}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="text-sm">
                      العربية
                      <input
                        className={field}
                        dir="rtl"
                        name="ar"
                        defaultValue={z.name_ar}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="text-sm">
                      {ar ? "الرسوم EGP" : "Delivery fee EGP"}
                      <input
                        className={field}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={10000}
                        step="0.01"
                        name="fee"
                        defaultValue={z.fee}
                        required
                      />
                    </label>
                    <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
                      <label className="flex min-h-12 items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-brand"
                          name="active"
                          defaultChecked={z.active}
                        />
                        {ar ? "منطقة مفعّلة" : "Zone is active"}
                      </label>
                      <ClayButton type="submit" variant="outline">
                        {ar ? "حفظ المنطقة" : "Save zone"}
                      </ClayButton>
                    </div>
                  </fieldset>
                </form>
              ))}
            </div>
            {!zones.length && (
              <p className="my-4 text-sm">
                {ar
                  ? "لا توجد مناطق توصيل. اختر إضافة منطقة للبدء."
                  : "No delivery zones yet. Choose Add zone to get started."}
              </p>
            )}
            {showZoneForm && (
              <section
                id="add-delivery-zone-form"
                aria-labelledby="add-delivery-zone-title"
                className="mt-4 rounded-2xl border border-line bg-canvas-sunk p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id="add-delivery-zone-title" className="text-lg">
                      {ar ? "منطقة توصيل جديدة" : "New delivery zone"}
                    </h3>
                    <p className="mt-2 text-sm text-ink-muted">
                      {ar
                        ? "أدخل اسم المنطقة باللغتين ورسوم التوصيل. ستكون متاحة للعملاء عند الحفظ."
                        : "Enter the area in both languages and its delivery fee. It will be available to customers when saved."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || loading}
                    aria-label={ar ? "إغلاق نموذج المنطقة" : "Close zone form"}
                    onClick={closeZoneForm}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (addingZone.current || busy || loading) return;
                    setZoneError("");
                    const v = {
                      name_en: zoneDraft.en.trim(),
                      name_ar: zoneDraft.ar.trim(),
                      fee: Number(zoneDraft.fee),
                      active: true,
                    };
                    if (!zoneDraft.fee.trim() || !validZone(v)) {
                      setZoneError(
                        ar
                          ? "أدخل اسم المنطقة باللغتين ورسومًا من 0 إلى 10000 جنيه."
                          : "Enter both zone names and a delivery fee between 0 and 10,000 EGP.",
                      );
                      return;
                    }
                    addingZone.current = true;
                    void save(() =>
                      storeClient().from("delivery_zones").insert(v),
                    )
                      .then((ok) => {
                        if (ok) {
                          setZoneDraft({ en: "", ar: "", fee: "" });
                          setZoneMessage(
                            ar
                              ? "تمت إضافة منطقة التوصيل وتفعيلها."
                              : "Delivery zone added and activated.",
                          );
                          closeZoneForm();
                        } else
                          setZoneError(
                            ar
                              ? "تعذر إضافة المنطقة. احتفظنا بالبيانات؛ حاول مجددًا."
                              : "Could not add the zone. Your entries have been kept; please try again.",
                          );
                      })
                      .finally(() => {
                        addingZone.current = false;
                      });
                  }}
                >
                  <fieldset
                    disabled={busy || loading}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <label className="text-sm">
                      English
                      <input
                        ref={zoneNameInput}
                        className={field}
                        name="en"
                        value={zoneDraft.en}
                        onChange={(event) =>
                          setZoneDraft((current) => ({
                            ...current,
                            en: event.target.value,
                          }))
                        }
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="text-sm">
                      العربية
                      <input
                        className={field}
                        dir="rtl"
                        name="ar"
                        value={zoneDraft.ar}
                        onChange={(event) =>
                          setZoneDraft((current) => ({
                            ...current,
                            ar: event.target.value,
                          }))
                        }
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="text-sm">
                      {ar ? "الرسوم EGP" : "Delivery fee EGP"}
                      <input
                        className={field}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={10000}
                        step="0.01"
                        name="fee"
                        value={zoneDraft.fee}
                        onChange={(event) =>
                          setZoneDraft((current) => ({
                            ...current,
                            fee: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    {zoneError && (
                      <p
                        role="alert"
                        className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2 lg:col-span-3"
                      >
                        {zoneError}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">
                      <ClayButton type="submit">
                        {busy
                          ? ar
                            ? "جارٍ الحفظ…"
                            : "Saving…"
                          : ar
                            ? "حفظ المنطقة"
                            : "Save new zone"}
                      </ClayButton>
                      <ClayButton
                        type="button"
                        variant="outline"
                        onClick={closeZoneForm}
                      >
                        {ar ? "إلغاء" : "Cancel"}
                      </ClayButton>
                    </div>
                  </fieldset>
                </form>
              </section>
            )}
          </section>
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
                      ? "إنستا باي غير جاهز عند الدفع حتى تضيف رابطًا أو رقم/عنوان مستلم صالحًا. لا نستخدم رقم واتساب تلقائيًا كجهة دفع."
                      : "InstaPay is unavailable at checkout until you add a valid payment link or recipient number/address. Your WhatsApp number is not used as a payment recipient automatically."}
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
                    ? "انسخ رابط الدفع من تطبيق إنستا باي أو أدخل رقم الاستلام/عنوان IPA الخاص بالمتجر. لا تُدخل كلمة مرور أو IPN PIN. تُحفظ بيانات المستلم مع الطلبات الجديدة."
                    : "Copy the payment link from InstaPay or enter the shop’s receiving mobile/IPA. Never enter a password or IPN PIN. Recipient details are saved with new orders."}
                </p>
                <div className="space-y-2 rounded-xl border border-line bg-canvas p-4 text-sm">
                  <h3 className="font-semibold">
                    {ar
                      ? "صور الدفع عبر واتساب"
                      : "Payment screenshots on WhatsApp"}
                  </h3>
                  <p className="text-ink-muted">
                    {ar
                      ? "بعد تسجيل الطلب، يمكن للعميل فتح واتساب برقم طلبه وإرفاق صورة الدفع. لا حاجة لكتابة تعليمات مخصصة."
                      : "After placing an order, customers can open WhatsApp with their order number and attach a payment screenshot. No custom instructions are needed."}
                  </p>
                  <p className="text-ink-muted">
                    {ar ? "رقم واتساب المتجر: " : "Shop WhatsApp: "}
                    <span
                      dir="ltr"
                      className="inline-block font-semibold text-ink"
                    >
                      +{WHATSAPP_NUMBER}
                    </span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {ar
                      ? "تحقق من وصول المبلغ قبل تحديد الطلب كمدفوع."
                      : "Verify receipt of the money before marking the order paid."}
                  </p>
                </div>
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
