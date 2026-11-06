"use client";
import { useEffect, useState } from "react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
export function CheckoutSettings() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [zones, setZones] = useState<
      {
        id: string;
        name_en: string;
        name_ar: string;
        fee: number;
        active: boolean;
      }[]
    >([]),
    [settings, setSettings] = useState({
      cash_enabled: true,
      transfer_enabled: false,
      transfer_instructions: "",
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const db = storeClient();
    const [z, s] = await Promise.all([
      db.from("delivery_zones").select("*"),
      db.from("checkout_settings").select("*").single(),
    ]);
    if (z.error || s.error) {
      setMessage(
        ar ? "تعذر تحميل إعدادات الشراء" : "Unable to load checkout settings",
      );
      return;
    }
    setZones(z.data);
    setSettings(s.data);
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await fn();
      if (error) throw error;
      await load();
      setMessage(ar ? "تم الحفظ" : "Saved");
    } catch {
      setMessage(ar ? "تعذر الحفظ" : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  const field =
    "block w-full min-h-12 rounded-clay border border-line bg-surface px-3";
  return (
    <section className="rounded-clay-lg border border-line bg-surface p-5 space-y-4">
      <h2 className="text-xl">
        {ar ? "التوصيل والدفع" : "Delivery & payment settings"}
      </h2>
      <p role="status">{message}</p>
      <p>
        {ar
          ? "أضف منطقة توصيل واحدة على الأقل لفتح الطلبات."
          : "Add at least one delivery zone to accept website orders."}
      </p>
      {zones.map((z) => (
        <form
          key={z.id}
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save(() =>
              storeClient()
                .from("delivery_zones")
                .update({
                  name_en: f.get("en"),
                  name_ar: f.get("ar"),
                  fee: Number(f.get("fee")),
                  active: f.get("active") === "on",
                })
                .eq("id", z.id),
            );
          }}
        >
          <label>
            English
            <input
              className={field}
              name="en"
              defaultValue={z.name_en}
              required
            />
          </label>
          <label>
            العربية
            <input
              className={field}
              name="ar"
              defaultValue={z.name_ar}
              required
            />
          </label>
          <label>
            {ar ? "الرسوم EGP" : "Fee EGP"}
            <input
              className={field}
              type="number"
              min="0"
              step="0.01"
              name="fee"
              defaultValue={z.fee}
              required
            />
          </label>
          <div>
            <label className="block min-h-12">
              <input type="checkbox" name="active" defaultChecked={z.active} />{" "}
              {ar ? "متاحة" : "Active"}
            </label>
            <ClayButton disabled={busy} type="submit">
              {ar ? "حفظ" : "Save"}
            </ClayButton>
          </div>
        </form>
      ))}
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void save(() =>
            storeClient()
              .from("delivery_zones")
              .insert({
                name_en: f.get("en"),
                name_ar: f.get("ar"),
                fee: Number(f.get("fee")),
              }),
          ).then(() => form.reset());
        }}
      >
        <label>
          English
          <input className={field} name="en" required />
        </label>
        <label>
          العربية
          <input className={field} name="ar" required />
        </label>
        <label>
          {ar ? "الرسوم EGP" : "Fee EGP"}
          <input
            className={field}
            type="number"
            min="0"
            step="0.01"
            name="fee"
            required
          />
        </label>
        <ClayButton disabled={busy} type="submit">
          {ar ? "إضافة منطقة" : "Add zone"}
        </ClayButton>
      </form>
      <form
        className="space-y-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(() =>
            storeClient()
              .from("checkout_settings")
              .update(settings)
              .eq("id", true),
          );
        }}
      >
        <label className="block">
          <input
            type="checkbox"
            checked={settings.cash_enabled}
            onChange={(e) =>
              setSettings({ ...settings, cash_enabled: e.target.checked })
            }
          />{" "}
          {ar ? "الدفع عند الاستلام" : "Cash on delivery"}
        </label>
        <label className="block">
          <input
            type="checkbox"
            checked={settings.transfer_enabled}
            onChange={(e) =>
              setSettings({ ...settings, transfer_enabled: e.target.checked })
            }
          />{" "}
          {ar ? "تحويل يدوي" : "Manual transfer"}
        </label>
        <label className="block">
          {ar
            ? "تعليمات التحويل للعملاء"
            : "Transfer instructions shown to customers"}
          <textarea
            className={field}
            rows={4}
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
        <ClayButton disabled={busy} type="submit">
          {ar ? "حفظ إعدادات الدفع" : "Save payment settings"}
        </ClayButton>
      </form>
    </section>
  );
}
