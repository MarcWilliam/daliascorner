"use client";
import { useEffect, useState, useCallback } from "react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
type Quality = {
  event_name: string;
  event_match_quality?: { composite_score?: number };
  event_coverage?: { percentage?: number; goal_percentage?: number };
  data_freshness?: { upload_frequency?: string; description?: string };
};
type AdSet = {
  ad_set_id: string;
  ad_set_name: string;
  objective: string;
  spend_amount?: number;
  spend_currency_code?: string;
  event_use: string;
};
type Campaign = {
  event_name: string;
  event_spend?: { amount: number; currency_code: string };
  event_ad_sets?: { data: AdSet[] };
};
type Health = {
  configured: boolean;
  checked_at?: string;
  quality?: Quality[];
  campaigns?: Campaign[];
  quality_error?: number;
  campaign_error?: number;
  pending?: number;
  sent?: number;
  failed?: number;
};
export function MetaHealth() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [data, setData] = useState<Health | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const db = storeClient();
      const { data: s } = await db.auth.getSession();
      if (!s.session) throw Error();
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meta-status`,
        {
          headers: {
            Authorization: `Bearer ${s.session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          },
        },
      );
      if (!r.ok) throw Error();
      setData(await r.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const missing = ar ? "غير متاح" : "Not available";
  const number = (value: number) =>
    new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", {
      maximumFractionDigits: 2,
    }).format(value);
  const frequency = (value?: string) =>
    value === "real_time"
      ? ar
        ? "في الوقت الفعلي"
        : "Real time"
      : (value?.replaceAll("_", " ") ?? missing);
  return (
    <section className="space-y-5">
      <div className="rounded-clay-lg border border-line bg-surface p-5 space-y-3">
        <h2 className="text-xl">{ar ? "Meta والإعلانات" : "Meta & ads"}</h2>
        <p>
          {ar
            ? "مقاييس Meta تشمل كل مصادر البيانات المتصلة، وقد تتأخر. نحدّث القراءة كل خمس دقائق."
            : "Meta metrics cover all connected integrations and may lag. Readings are cached for five minutes."}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-brand">
          <a
            href="https://business.facebook.com/events_manager2/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {ar ? "فتح مدير الأحداث ↗" : "Open Events Manager ↗"}
          </a>
          <a
            href="https://adsmanager.facebook.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {ar ? "فتح مدير الإعلانات ↗" : "Open Ads Manager ↗"}
          </a>
        </div>
        <ClayButton
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy
            ? ar
              ? "جارٍ التحميل…"
              : "Loading…"
            : ar
              ? "تحديث"
              : "Refresh"}
        </ClayButton>
        {error && (
          <p role="alert">
            {ar
              ? "تعذر تحميل بيانات Meta. حاول مرة أخرى."
              : "Unable to load Meta data. Try again."}
          </p>
        )}
        {data && !data.configured && (
          <p>
            {ar
              ? "لم يتم إعداد اتصال Meta بعد."
              : "Meta connection is not configured yet."}
          </p>
        )}
        {data?.checked_at && (
          <p className="text-sm text-ink-muted">
            {new Date(data.checked_at).toLocaleString(locale)}
          </p>
        )}
      </div>
      {data?.configured && (
        <>
          {!!data.failed && (
            <p
              role="status"
              className="rounded-xl border border-line bg-surface p-4"
            >
              {ar
                ? "تحتاج بعض أحداث المتجر إلى المراجعة. تحقق من اتصال Meta قبل الاعتماد على تقارير الإعلانات."
                : "Some website events need review. Check the Meta connection before relying on advertising reports."}
            </p>
          )}
          <div className="rounded-clay-lg border border-line bg-surface p-5">
            <h3 className="text-lg">
              {ar ? "أحداث هذا المتجر" : "This website’s event queue"}
            </h3>
            <dl className="grid grid-cols-3 gap-3 mt-3">
              {[
                [ar ? "في الانتظار" : "Pending", data.pending],
                [ar ? "مُرسلة" : "Sent", data.sent],
                [
                  ar ? "متوقفة / تحتاج مراجعة" : "Stopped / review",
                  data.failed,
                ],
              ].map(([label, n]) => (
                <div key={String(label)}>
                  <dt className="text-sm">{label}</dt>
                  <dd className="text-2xl font-bold">{n ?? missing}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm">
              {ar
                ? "حدث Purchase يُسجل عندما يؤكد المسؤول استلام الدفع."
                : "Purchase is queued when an admin confirms payment received."}
            </p>
          </div>
          {data.quality_error ? (
            <p role="alert">
              {ar
                ? "مقاييس الجودة غير متاحة لهذا الاتصال."
                : "Dataset Quality metrics are unavailable for this connection."}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.quality?.map((q) => (
                <article
                  key={q.event_name}
                  className="rounded-clay-lg border border-line bg-surface p-5 space-y-2"
                >
                  <h3 className="text-xl">{q.event_name}</h3>
                  <p>
                    {ar ? "جودة المطابقة" : "Match quality"}:{" "}
                    {q.event_match_quality?.composite_score == null
                      ? missing
                      : `${number(q.event_match_quality.composite_score)} / 10`}
                  </p>
                  <p>
                    {ar ? "تغطية الأحداث" : "Event coverage"}:{" "}
                    {q.event_coverage?.percentage == null
                      ? missing
                      : `${number(q.event_coverage.percentage)}%`}
                    {q.event_coverage?.goal_percentage != null && (
                      <span className="text-sm text-ink-muted">
                        {" "}
                        {ar ? "· المستهدف" : "· goal"}{" "}
                        {number(q.event_coverage.goal_percentage)}%
                      </span>
                    )}
                  </p>
                  <p>
                    {ar ? "تكرار الإرسال" : "Upload frequency"}:{" "}
                    {frequency(q.data_freshness?.upload_frequency)}
                  </p>
                </article>
              ))}
              {!data.quality?.length && (
                <p>
                  {ar
                    ? "لا توجد مقاييس جودة حتى الآن."
                    : "No quality metrics are available yet."}
                </p>
              )}
            </div>
          )}
          <section className="rounded-clay-lg border border-line bg-surface p-5 space-y-4">
            <h3 className="text-xl">
              {ar ? "استخدام الأحداث في الإعلانات" : "Event use in advertising"}
            </h3>
            <p className="text-sm">
              {ar
                ? "عرض للقراءة فقط. إدارة الحملات والميزانيات تتم في Ads Manager. هذه الأرقام مرتبطة بالأحداث وليست إجمالي إنفاق الحساب."
                : "Read-only view. Manage campaigns and budgets in Ads Manager. These are event-associated figures, not a complete account spend report."}
            </p>
            {data.campaign_error ? (
              <p>
                {ar
                  ? "بيانات الحملات غير متاحة."
                  : "Campaign data is unavailable."}
              </p>
            ) : (
              data.campaigns?.map((e) => (
                <article
                  key={e.event_name}
                  className="border-t border-line pt-3"
                >
                  <h4 className="font-bold">{e.event_name}</h4>
                  {e.event_spend && (
                    <p>
                      {number(e.event_spend.amount)}{" "}
                      {e.event_spend.currency_code}
                    </p>
                  )}
                  <ul className="space-y-3">
                    {e.event_ad_sets?.data?.map((a) => (
                      <li key={a.ad_set_id}>
                        <p>{a.ad_set_name}</p>
                        <p className="text-sm text-ink-muted">
                          {a.objective} · {a.event_use} ·{" "}
                          {a.spend_amount == null
                            ? missing
                            : number(a.spend_amount)}{" "}
                          {a.spend_currency_code}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {!e.event_ad_sets?.data?.length && (
                    <p className="text-sm">
                      {ar
                        ? "لم ترجع Meta مجموعات إعلانية لهذا الحدث."
                        : "Meta returned no associated ad sets for this event."}
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </section>
  );
}
