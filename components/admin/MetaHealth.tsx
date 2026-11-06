"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
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
const panel = "rounded-2xl border border-line bg-surface p-4 sm:p-5";
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
        : connectionIssue
          ? ar
            ? "تحتاج مراجعة"
            : "Needs attention"
          : ar
            ? "تم الإعداد"
            : "Configured";
  const StateIcon =
    error || connectionIssue
      ? AlertCircle
      : data?.configured
        ? ShieldCheck
        : Clock3;
  return (
    <section
      className="min-w-0 space-y-5"
      aria-label={ar ? "متابعة Meta والإعلانات" : "Meta reporting overview"}
      aria-busy={busy}
    >
      <section className={panel} aria-labelledby="meta-connection-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="meta-connection-title" className="text-xl">
                {ar ? "اتصال Meta" : "Meta connection"}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${error || connectionIssue ? "bg-orange/20 text-ink" : "bg-leaf-soft text-brand"}`}
              >
                <StateIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {status}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              {ar
                ? "راجع إرسال أحداث موقعك، ثم جودة البيانات واستخدامها في الإعلانات. إدارة الحملات والميزانيات تتم في مدير الإعلانات."
                : "Check website event delivery, then Meta data quality and advertising use. Manage campaigns and budgets in Ads Manager."}
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
          <section aria-labelledby="meta-queue-title" className="space-y-3">
            <div>
              <h2 id="meta-queue-title" className="text-xl">
                {ar ? "إرسال أحداث هذا الموقع" : "Website event delivery"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {ar
                  ? "هذه أرقام قائمة إرسال المتجر فقط، وتُقرأ عند تحديث الصفحة."
                  : "These counts belong only to this shop’s server event queue and are read on refresh."}
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: ar ? "في الانتظار" : "Pending",
                  value: data.pending,
                  hint: ar
                    ? "تنتظر الإرسال أو إعادة المحاولة"
                    : "Waiting to send or retry",
                  icon: Clock3,
                },
                {
                  label: ar ? "مُرسلة" : "Sent",
                  value: data.sent,
                  hint: ar ? "أحداث قبلتها Meta" : "Events accepted by Meta",
                  icon: CheckCircle2,
                },
                {
                  label: ar ? "متوقفة / للمراجعة" : "Stopped / review",
                  value: data.failed,
                  hint: ar
                    ? "توقفت أو تحتاج فحص الأهلية"
                    : "Stopped or eligibility needs review",
                  icon: AlertCircle,
                },
              ].map((item) => {
                const Icon = item.icon;
                const value = numeric(item.value);
                return (
                  <div
                    key={item.label}
                    className={`${panel} flex items-start gap-3`}
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas-sunk text-brand">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-ink-muted">
                        {item.label}
                      </dt>
                      <dd className="mt-2 break-words text-2xl font-bold tabular-nums">
                        {value === null ? missing : number(value)}
                      </dd>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {item.hint}
                      </p>
                    </div>
                  </div>
                );
              })}
            </dl>
            {failed !== null && failed > 0 && (
              <p
                role="status"
                className="rounded-xl border border-orange/35 bg-orange/10 p-3 text-sm"
              >
                {ar
                  ? "توجد أحداث متوقفة. قد يتوقف الإبلاغ عند تغير أهلية الطلب؛ راجع الطلبات والاتصال قبل الاعتماد على تقارير الإعلان."
                  : "Some events are stopped. Reporting can stop when order eligibility changes; review orders and the connection before relying on ad reports."}
              </p>
            )}
            <p className="px-1 text-xs leading-5 text-ink-muted">
              {ar
                ? "يُضاف Purchase بعد تأكيد استلام الدفع للطلب المؤهل للإعلانات. تقديم الطلب وحده لا يعني تسجيل عملية شراء."
                : "Purchase is queued after payment is confirmed for an ad-eligible order. Placing an order alone does not report a purchase."}
            </p>
          </section>
          <section className={panel} aria-labelledby="meta-quality-title">
            <h2 id="meta-quality-title" className="text-xl">
              {ar ? "جودة بيانات Meta" : "Meta data quality"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              {ar
                ? "تشمل هذه المقاييس كل المصادر المتصلة بمجموعة البيانات، وقد تتأخر. تُحفظ قراءة Meta مؤقتًا لخمس دقائق؛ عدم توفر قيمة لا يعني أنها صفر."
                : "These metrics cover every integration connected to the dataset and may lag. Meta readings are cached for five minutes; unavailable values are not zero."}
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
                          className="px-4 py-3 text-start font-semibold"
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
                            className="px-4 py-4 text-start font-semibold"
                          >
                            <span className="block">
                              {eventName(q.event_name)}
                            </span>
                            <span className="mt-1 block font-mono text-[11px] font-normal text-ink-muted">
                              {q.event_name}
                            </span>
                          </th>
                          <td className="px-4 py-4">
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
                          <td className="px-4 py-4">
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
                          <td className="px-4 py-4">
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
            <h2 id="meta-ads-title" className="text-xl">
              {ar ? "استخدام الأحداث في الإعلانات" : "Advertising use"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              {ar
                ? "عرض للقراءة فقط من Meta. الإنفاق أدناه مرتبط بكل حدث وقد يتداخل بين الأحداث؛ لا يُجمع كإجمالي إنفاق الحساب ولا يُضاف تلقائيًا لمصروفات المتجر."
                : "Read-only data from Meta. Spend below is associated with each event and may overlap across events; it is not an account spend total or an automatic expense entry."}
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
                      <ul className="mt-3 grid gap-2 md:grid-cols-2">
                        {event.event_ad_sets.data.map((ad) => (
                          <li
                            key={ad.ad_set_id}
                            className="min-w-0 rounded-xl border border-line bg-canvas/40 p-3"
                          >
                            <p className="break-words font-semibold">
                              {ad.ad_set_name}
                            </p>
                            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
