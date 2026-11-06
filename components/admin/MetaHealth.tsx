"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { storeClient } from "@/lib/store/client";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";

type Metric = number | string | null;
type Quality = {
  event_name: string;
  event_match_quality?: { composite_score?: Metric };
  event_coverage?: { percentage?: Metric; goal_percentage?: Metric };
  data_freshness?: { upload_frequency?: string; description?: string };
};
type AdSet = {
  ad_set_id: string;
  ad_set_name: string;
  objective: string;
  spend_amount?: Metric;
  spend_currency_code?: string;
  event_use?: string;
};
type Campaign = {
  event_name: string;
  event_spend?: { amount: Metric; currency_code: string };
  event_ad_sets?: { data?: AdSet[] };
};
type Health = {
  configured: boolean;
  checked_at?: string;
  quality?: Quality[];
  campaigns?: Campaign[];
  quality_error?: number;
  campaign_error?: number;
  pending?: Metric;
  sent?: Metric;
  failed?: Metric;
};
const panel = "rounded-xl border border-line bg-surface p-4";
const action =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-brand transition-colors hover:bg-canvas-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50";
function numeric(value: Metric | undefined): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function MetaHealth({
  refreshKey = 0,
  hideRefresh = false,
}: {
  refreshKey?: number;
  hideRefresh?: boolean;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { session, ready, roleReady, isAdmin } = useCustomerAuth();
  const userId = session?.user.id ?? "";
  const identity = useRef(userId);
  identity.current = userId;
  const request = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    data: Health;
  } | null>(null);
  const [loading, setLoading] = useState({ owner: "", value: false });
  const [failure, setFailure] = useState({ owner: "", value: false });
  const busy = loading.owner === userId && loading.value;
  const error = failure.owner === userId && failure.value;
  const data =
    ready && roleReady && isAdmin && snapshot?.owner === userId
      ? snapshot.data
      : null;
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () =>
      request.current === controller && identity.current === userId;
    if (!ready || !roleReady || !isAdmin || !userId) {
      setSnapshot(null);
      setLoading({ owner: userId, value: false });
      return;
    }
    setLoading({ owner: userId, value: true });
    setFailure({ owner: userId, value: false });
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const { data: auth, error: authError } =
        await storeClient().auth.getSession();
      if (!current()) return;
      if (authError || auth.session?.user.id !== userId)
        throw Error("SESSION_CHANGED");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meta-status`,
        {
          headers: {
            Authorization: `Bearer ${auth.session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          },
          signal: controller.signal,
        },
      );
      if (!current()) return;
      if (!response.ok) throw Error("META_UNAVAILABLE");
      const value = await response.json();
      if (!current()) return;
      if (typeof value?.configured !== "boolean")
        throw Error("INVALID_RESPONSE");
      setSnapshot({
        owner: userId,
        data: {
          ...value,
          quality: Array.isArray(value.quality) ? value.quality : [],
          campaigns: Array.isArray(value.campaigns) ? value.campaigns : [],
        },
      });
    } catch {
      if (current()) setFailure({ owner: userId, value: true });
    } finally {
      clearTimeout(timeout);
      if (current()) setLoading({ owner: userId, value: false });
    }
  }, [ready, roleReady, isAdmin, userId]);
  useEffect(() => {
    void refresh();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [refresh, refreshKey]);
  const missing = ar ? "غير متاح" : "Not available";
  const number = (value: number) =>
    new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", {
      maximumFractionDigits: 2,
    }).format(value);
  const amount = (value: Metric | undefined, currency?: string) => {
    const result = numeric(value);
    return result === null
      ? missing
      : `${number(result)}${currency ? ` ${currency}` : ""}`;
  };
  const eventName = (value: string) =>
    ({
      Purchase: ar ? "المشتريات" : "Purchases",
      Lead: ar ? "العملاء المحتملون" : "Leads",
      PageView: ar ? "زيارات الصفحات" : "Page views",
      ViewContent: ar ? "مشاهدات المنتجات" : "Product views",
      AddToCart: ar ? "الإضافة للسلة" : "Add to cart",
      InitiateCheckout: ar ? "بدء الطلب" : "Checkout started",
      SubscribedButtonClick: ar ? "تفاعل مع زر" : "Button interaction",
    })[value] ?? value;
  const frequency = (value?: string) =>
    value === "real_time"
      ? ar
        ? "في الوقت الفعلي"
        : "Real time"
      : (value?.replaceAll("_", " ") ?? missing);
  const readable = (value?: string) => {
    if (!value) return missing;
    const known: Record<string, string> = ar
      ? {
          OUTCOME_SALES: "المبيعات",
          OUTCOME_LEADS: "عملاء محتملون",
          OUTCOME_TRAFFIC: "الزيارات",
          OUTCOME_AWARENESS: "الوعي",
          OUTCOME_ENGAGEMENT: "التفاعل",
          CONVERSIONS: "التحويلات",
          optimization: "تحسين النتائج",
          measurement: "قياس النتائج",
        }
      : {
          OUTCOME_SALES: "Sales",
          OUTCOME_LEADS: "Leads",
          OUTCOME_TRAFFIC: "Traffic",
          OUTCOME_AWARENESS: "Awareness",
          OUTCOME_ENGAGEMENT: "Engagement",
          CONVERSIONS: "Conversions",
          optimization: "Optimization",
          measurement: "Measurement",
        };
    return (
      known[value] ??
      value
        .replace(/^OUTCOME_/, "")
        .replaceAll("_", " ")
        .toLowerCase()
    );
  };
  const failed = numeric(data?.failed);
  const connectionIssue = !!(data?.quality_error || data?.campaign_error);
  const deliveryIssue = failed !== null && failed > 0;
  const status = error
    ? ar
      ? "تعذر التحديث"
      : "Refresh unavailable"
    : !data
      ? ar
        ? "جارٍ التحقق"
        : "Checking connection"
      : !data.configured
        ? ar
          ? "غير مُعدّ"
          : "Not configured"
        : connectionIssue || deliveryIssue
          ? ar
            ? "تحتاج مراجعة"
            : "Needs attention"
          : ar
            ? "تم الإعداد"
            : "Configured";
  const StateIcon =
    error || connectionIssue || deliveryIssue
      ? AlertCircle
      : data?.configured
        ? ShieldCheck
        : Clock3;
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label={ar ? "متابعة Meta والإعلانات" : "Meta reporting overview"}
      aria-busy={busy}
    >
      <section className={panel} aria-labelledby="meta-connection-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="meta-connection-title" className="text-lg">
                {ar ? "اتصال Meta" : "Meta connection"}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${error || connectionIssue || deliveryIssue ? "bg-orange/20 text-ink" : "bg-leaf-soft text-brand"}`}
              >
                <StateIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {status}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
              {ar
                ? "تابع حالة الاتصال والبيانات المستخدمة في إعلانات المتجر."
                : "Connection status and data used in your shop’s ads."}
            </p>
          </div>
          {!hideRefresh && (
            <button
              type="button"
              className={`${action} w-11 shrink-0 !px-0`}
              onClick={() => void refresh()}
              disabled={busy}
              aria-label={ar ? "تحديث بيانات Meta" : "Refresh Meta data"}
              title={ar ? "تحديث بيانات Meta" : "Refresh Meta data"}
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${busy ? "motion-safe:animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className={action}
            href="https://business.facebook.com/events_manager2/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {ar ? "مدير الأحداث" : "Events Manager"}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </a>
          <a
            className={action}
            href="https://adsmanager.facebook.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {ar ? "مدير الإعلانات" : "Ads Manager"}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
        {busy && (
          <p role="status" className="mt-3 text-xs text-ink-muted">
            {ar ? "جارٍ تحميل التقارير…" : "Loading reporting data…"}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-orange/35 bg-orange/10 p-3 text-sm"
          >
            <p>
              {ar
                ? "تعذر تحديث بيانات Meta. تظل آخر قراءة متاحة أدناه إن وُجدت."
                : "Meta data could not refresh. The last available reading remains below, if one was loaded."}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="mt-1 min-h-11 rounded-lg font-semibold text-brand underline"
            >
              {ar ? "المحاولة مجددًا" : "Try again"}
            </button>
          </div>
        )}
        {data && !data.configured && (
          <p className="mt-4 rounded-xl bg-canvas-sunk p-3 text-sm">
            {ar
              ? "لم يُعد اتصال التقارير بعد. يمكن متابعة الطلبات والمخزون والحسابات من الأقسام الأخرى."
              : "The reporting connection has not been configured yet. Orders, stock and finances remain available in their own sections."}
          </p>
        )}
        {deliveryIssue && (
          <p role="status" className="mt-3 rounded-lg bg-orange/15 p-3 text-sm">
            {ar
              ? `${number(failed!)} أحداث متوقفة أو تحتاج مراجعة. راجع الطلبات والاتصال في مدير الأحداث؛ تغير أهلية الطلب قد يوقف الإبلاغ.`
              : `${number(failed!)} events are stopped or need review. Review orders and the connection in Events Manager; changed order eligibility can stop reporting.`}
          </p>
        )}
        {data?.configured && !error && !connectionIssue && !deliveryIssue && (
          <p className="mt-3 text-xs text-ink-muted">
            {failed === 0
              ? ar
                ? "لا توجد أحداث متوقفة في القراءة الحالية."
                : "No stopped events in the current reading."
              : ar
                ? "حالة الإرسال غير متاحة؛ افتح تفاصيل الإرسال لمراجعة القراءة."
                : "Delivery status unavailable; check Delivery details."}
          </p>
        )}
        {connectionIssue && (
          <p className="mt-4 rounded-xl bg-orange/10 p-3 text-sm">
            {ar
              ? "لم تُرجع Meta بعض المقاييس. راجع الاتصال وصلاحيات مجموعة البيانات في مدير الأحداث."
              : "Meta did not return some metrics. Review the connection and dataset permissions in Events Manager."}
          </p>
        )}
      </section>
      {data?.configured && (
        <>
          <details className={panel}>
            <summary className="min-h-11 cursor-pointer font-semibold">
              {ar ? "تفاصيل الإرسال" : "Delivery details"}
            </summary>
            <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:divide-x-reverse">
              {[
                { label: ar ? "في الانتظار" : "Pending", value: data.pending },
                { label: ar ? "مُرسلة" : "Sent", value: data.sent },
                {
                  label: ar ? "متوقفة / للمراجعة" : "Stopped / review",
                  value: data.failed,
                },
              ].map((item) => (
                <div key={item.label} className="py-2 sm:px-3 first:ps-0">
                  <dt className="text-xs text-ink-muted">{item.label}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {numeric(item.value) === null
                      ? missing
                      : number(numeric(item.value)!)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              {ar
                ? "أرقام قائمة إرسال هذا الموقع فقط؛ تُقرأ عند التحديث. يُرسل Purchase بعد تأكيد استلام الدفع لطلب مؤهل للإعلانات. تقديم الطلب وحده لا يُسجّل شراءً."
                : "This website’s event queue, read on refresh. Purchase is queued only after payment is confirmed for an ad-eligible order; placing an order alone does not report a purchase."}
            </p>
          </details>
          <section className={panel} aria-labelledby="meta-quality-title">
            <h2 id="meta-quality-title" className="text-lg">
              {ar ? "جودة بيانات Meta" : "Meta data quality"}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
              {ar
                ? "كل مصادر مجموعة البيانات · تخزين مؤقت لخمس دقائق · القيم غير المتاحة لا تعني صفرًا."
                : "Dataset-wide metrics · May lag · Five-minute cache · Unavailable is not zero."}
            </p>
            {data.checked_at &&
              Number.isFinite(Date.parse(data.checked_at)) && (
                <p className="mt-2 text-xs text-ink-muted">
                  {ar ? "قراءة Meta في" : "Meta reading from"}{" "}
                  {new Date(data.checked_at).toLocaleString(
                    ar ? "ar-EG" : "en-GB",
                    {
                      timeZone: "Africa/Cairo",
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  )}
                </p>
              )}
            {data.quality_error ? (
              <p
                role="status"
                className="mt-4 rounded-xl bg-canvas-sunk p-3 text-sm"
              >
                {ar
                  ? "مقاييس الجودة غير متاحة لهذا الاتصال حاليًا."
                  : "Quality metrics are currently unavailable for this connection."}
              </p>
            ) : !data.quality?.length ? (
              <p className="mt-4 rounded-xl bg-canvas-sunk p-4 text-sm text-ink-muted">
                {ar
                  ? "لم تُرجع Meta مقاييس جودة بعد. ستظهر هنا عندما تصبح متاحة."
                  : "Meta has not returned quality metrics yet. They will appear here when available."}
              </p>
            ) : (
              <div
                role="region"
                aria-label={
                  ar ? "مقارنة جودة الأحداث" : "Event quality comparison"
                }
                tabIndex={0}
                className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
              >
                <table className="w-full min-w-[36rem] border-collapse text-start text-sm">
                  <thead className="bg-canvas-sunk text-xs text-ink-muted">
                    <tr>
                      {[
                        ar ? "الحدث" : "Event",
                        ar ? "جودة المطابقة" : "Match quality",
                        ar ? "تغطية الأحداث" : "Event coverage",
                        ar ? "تكرار الإرسال" : "Upload frequency",
                      ].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className="px-3 py-2 text-start font-semibold"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.quality.map((q) => {
                      const score = numeric(
                          q.event_match_quality?.composite_score,
                        ),
                        coverage = numeric(q.event_coverage?.percentage),
                        goal = numeric(q.event_coverage?.goal_percentage);
                      return (
                        <tr key={q.event_name}>
                          <th
                            scope="row"
                            className="px-3 py-3 text-start font-semibold"
                          >
                            <span className="block">
                              {eventName(q.event_name)}
                            </span>
                            <span className="mt-1 block font-mono text-[11px] font-normal text-ink-muted">
                              {q.event_name}
                            </span>
                          </th>
                          <td className="px-3 py-3">
                            <span className="font-semibold tabular-nums">
                              {score === null
                                ? missing
                                : `${number(score)} / 10`}
                            </span>
                            {score !== null && (
                              <div
                                aria-hidden="true"
                                className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-canvas-sunk"
                              >
                                <div
                                  className="h-full rounded-full bg-brand"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, score * 10))}%`,
                                  }}
                                />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="tabular-nums">
                              {coverage === null
                                ? missing
                                : `${number(coverage)}%`}
                            </span>
                            {goal !== null && (
                              <p className="mt-1 text-xs text-ink-muted">
                                {ar ? "المستهدف" : "Goal"}: {number(goal)}%
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {frequency(q.data_freshness?.upload_frequency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className={panel} aria-labelledby="meta-ads-title">
            <h2 id="meta-ads-title" className="text-lg">
              {ar ? "استخدام الأحداث في الإعلانات" : "Advertising use"}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
              {ar
                ? "قراءة من Meta. قد يتداخل الإنفاق المرتبط بالأحداث؛ ليس إجمالي إنفاق الحساب ولا يُضاف تلقائيًا للمصروفات."
                : "Read-only Meta data. Event-associated spend may overlap; it is not total account spend and is not added to expenses."}
            </p>
            {data.campaign_error ? (
              <p
                role="status"
                className="mt-4 rounded-xl bg-canvas-sunk p-3 text-sm"
              >
                {ar
                  ? "بيانات استخدام الإعلانات غير متاحة حاليًا."
                  : "Advertising-use data is currently unavailable."}
              </p>
            ) : !data.campaigns?.length ? (
              <p className="mt-4 rounded-xl bg-canvas-sunk p-4 text-sm text-ink-muted">
                {ar
                  ? "لم تُرجع Meta بيانات إعلانات لهذه الأحداث بعد. افتح مدير الإعلانات لمراجعة الحملات."
                  : "Meta has not returned advertising-use data for these events yet. Open Ads Manager to review campaigns."}
              </p>
            ) : (
              <div className="mt-4 divide-y divide-line">
                {data.campaigns.map((event) => (
                  <article
                    key={event.event_name}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base">
                          {eventName(event.event_name)}
                        </h3>
                        <p className="mt-1 font-mono text-[11px] text-ink-muted">
                          {event.event_name}
                        </p>
                      </div>
                      <div className="text-start sm:text-end">
                        <p className="text-xs text-ink-muted">
                          {ar ? "إنفاق مرتبط بالحدث" : "Event-associated spend"}
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {amount(
                            event.event_spend?.amount,
                            event.event_spend?.currency_code,
                          )}
                        </p>
                      </div>
                    </div>
                    {event.event_ad_sets?.data?.length ? (
                      <ul className="mt-2 divide-y divide-line">
                        {event.event_ad_sets.data.map((ad) => (
                          <li
                            key={ad.ad_set_id}
                            className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                          >
                            <p className="break-words font-semibold">
                              {ad.ad_set_name}
                            </p>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <dt className="text-ink-muted">
                                {ar ? "الهدف" : "Objective"}
                              </dt>
                              <dd className="break-words text-end">
                                {readable(ad.objective)}
                              </dd>
                              <dt className="text-ink-muted">
                                {ar ? "الاستخدام" : "Use"}
                              </dt>
                              <dd className="break-words text-end">
                                {readable(ad.event_use)}
                              </dd>
                              <dt className="text-ink-muted">
                                {ar ? "الإنفاق" : "Spend"}
                              </dt>
                              <dd className="text-end tabular-nums">
                                {amount(
                                  ad.spend_amount,
                                  ad.spend_currency_code,
                                )}
                              </dd>
                            </dl>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-ink-muted">
                        {ar
                          ? "لا توجد مجموعات إعلانية مرتبطة بهذا الحدث في القراءة الحالية."
                          : "No associated ad sets were returned for this event in the current reading."}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
