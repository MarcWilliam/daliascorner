"use client";
import { useCallback, useEffect, useState } from "react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
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
export function CheckoutSettings() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [zones, setZones] = useState<Zone[]>([]),
    [settings, setSettings] = useState({
      cash_enabled: true,
      transfer_enabled: false,
      transfer_instructions: "",
    });
  const [savedMethods, setSavedMethods] = useState({
    cash_enabled: true,
    transfer_enabled: false,
  });
  const [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = storeClient();
      const [z, s] = await Promise.all([
        db.from("delivery_zones").select("*").order("name_en"),
        db.from("checkout_settings").select("*").single(),
      ]);
      if (z.error || s.error) throw Error();
      setZones(z.data);
      setSettings({
        cash_enabled: s.data.cash_enabled,
        transfer_enabled: s.data.transfer_enabled,
        transfer_instructions: s.data.transfer_instructions ?? "",
      });
      setSavedMethods(s.data);
      setReady(true);
      return true;
    } catch {
      setError(
        ar
          ? "تعذر تحميل الإعدادات. حاول مرة أخرى."
          : "Unable to load settings. Please try again.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [ar]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fn();
      if (r.error) throw r.error;
      const refreshed = await load();
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
    (!savedMethods.cash_enabled && !savedMethods.transfer_enabled);
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className={panel}>
        <h1 className="text-xl">
          {ar ? "التوصيل والدفع" : "Delivery & payment"}
        </h1>
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
            <h2 className="text-lg">
              {ar ? "مناطق التوصيل" : "Delivery zones"}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {ar
                ? "المناطق المفعّلة فقط تظهر للعملاء. أوقف أي منطقة مؤقتًا دون حذفها."
                : "Only active zones appear to customers. Pause a zone at any time without deleting it."}
            </p>
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
                  ? "لا توجد مناطق توصيل. أضف أول منطقة أدناه."
                  : "No delivery zones yet. Add your first zone below."}
              </p>
            )}
            <details
              open={!zones.length}
              className="mt-4 rounded-2xl border border-line bg-canvas-sunk p-4"
            >
              <summary className="min-h-11 cursor-pointer font-semibold">
                {ar ? "إضافة منطقة توصيل" : "Add a delivery zone"}
              </summary>
              <form
                className="mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const v = { ...zoneValues(form), active: true };
                  if (validZone(v))
                    void save(() =>
                      storeClient().from("delivery_zones").insert(v),
                    ).then((ok) => {
                      if (ok) form.reset();
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
                      className={field}
                      name="en"
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
                      required
                    />
                  </label>
                  <ClayButton
                    className="sm:col-span-2 lg:col-span-3"
                    type="submit"
                  >
                    {ar ? "إضافة وتفعيل المنطقة" : "Add active zone"}
                  </ClayButton>
                </fieldset>
              </form>
            </details>
          </section>
          <section className={panel}>
            <h2 className="text-lg">{ar ? "طرق الدفع" : "Payment methods"}</h2>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  settings.transfer_enabled &&
                  !settings.transfer_instructions.trim()
                ) {
                  setError(
                    ar
                      ? "أضف تعليمات التحويل أولاً."
                      : "Add transfer instructions first.",
                  );
                  return;
                }
                void save(() =>
                  storeClient()
                    .from("checkout_settings")
                    .update({
                      ...settings,
                      transfer_instructions:
                        settings.transfer_instructions.trim(),
                    })
                    .eq("id", true),
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
                  {ar ? "تحويل يدوي" : "Manual transfer"}
                </label>
                <label className="block text-sm">
                  {ar
                    ? "تعليمات التحويل للعملاء"
                    : "Transfer instructions shown to customers"}
                  <textarea
                    className={field}
                    rows={4}
                    maxLength={3000}
                    required={settings.transfer_enabled}
                    value={settings.transfer_instructions}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        transfer_instructions: e.target.value,
                      })
                    }
                  />
                </label>
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
