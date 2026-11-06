"use client";

import { useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { storeClient } from "@/lib/store/client";
import { storeCopy } from "@/lib/store/copy";

type Payment = "unpaid" | "paid" | "refunded";
type Feedback = "idle" | "saving" | "saved" | "reconciled" | "unknown";
function paymentValue(value: unknown): Payment | null {
  return value === "unpaid" || value === "paid" || value === "refunded"
    ? value
    : null;
}
export function OrderPaymentField({
  orderId,
  payment,
  disabled = false,
  onSaved,
  onSavingChange,
}: {
  orderId: string;
  payment: Payment;
  disabled?: boolean;
  onSaved: () => Promise<void>;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = storeCopy[locale];
  const { session, ready } = useCustomerAuth();
  const identity = `${session?.user.id ?? "guest"}:${orderId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [state, setState] = useState<{
    owner: string;
    value: Payment | null;
    feedback: Feedback;
    refreshWarning: boolean;
  }>({
    owner: identity,
    value: payment,
    feedback: "idle",
    refreshWarning: false,
  });
  const view =
    state.owner === identity
      ? state
      : {
          owner: identity,
          value: payment,
          feedback: "idle" as Feedback,
          refreshWarning: false,
        };
  const actual = useRef({ owner: identity, value: payment });
  const active = useRef<{
    owner: string;
    generation: number;
    controller: AbortController;
  } | null>(null);
  const generation = useRef(0);
  const savingCallback = useRef(onSavingChange);
  savingCallback.current = onSavingChange;
  const pending = useRef(false);
  const [pendingOwner, setPendingOwner] = useState("");
  useEffect(() => {
    actual.current = { owner: identity, value: payment };
    if (!pending.current)
      setState((previous) =>
        previous.owner === identity &&
        (previous.feedback === "unknown" || previous.value === payment)
          ? previous
          : {
              owner: identity,
              value: payment,
              feedback: "idle",
              refreshWarning: false,
            },
      );
  }, [identity, payment]);
  useEffect(
    () => () => {
      if (active.current?.owner === identity) {
        active.current.controller.abort();
        active.current = null;
        if (pending.current) {
          pending.current = false;
          setPendingOwner((previous) =>
            previous === identity ? "" : previous,
          );
          savingCallback.current?.(false);
        }
      }
    },
    [identity],
  );
  function start() {
    active.current?.controller.abort();
    const request = {
      owner: identity,
      generation: ++generation.current,
      controller: new AbortController(),
    };
    active.current = request;
    const current = () =>
      active.current === request && currentIdentity.current === request.owner;
    pending.current = true;
    setPendingOwner(identity);
    savingCallback.current?.(true);
    return { ...request, current };
  }
  async function timed<T>(
    request: ReturnType<typeof start>,
    work: (signal: AbortSignal) => PromiseLike<T>,
  ): Promise<T> {
    const operation = new AbortController();
    const abort = () => operation.abort();
    request.controller.signal.addEventListener("abort", abort, { once: true });
    if (request.controller.signal.aborted) abort();
    const timer = setTimeout(abort, 20000);
    try {
      return await work(operation.signal);
    } finally {
      clearTimeout(timer);
      request.controller.signal.removeEventListener("abort", abort);
    }
  }
  function finish(request: ReturnType<typeof start>) {
    if (!request.current()) return;
    active.current = null;
    pending.current = false;
    setPendingOwner((previous) => (previous === identity ? "" : previous));
    savingCallback.current?.(false);
  }
  async function refreshParent(request: ReturnType<typeof start>) {
    try {
      await onSaved();
    } catch {
      if (request.current())
        setState((previous) =>
          previous.owner === identity
            ? { ...previous, refreshWarning: true }
            : previous,
        );
    }
  }
  async function reconcile(
    request: ReturnType<typeof start>,
    selected?: Payment,
  ) {
    try {
      const result = await timed(request, (signal) =>
        storeClient()
          .from("orders")
          .select("payment_status")
          .eq("id", orderId)
          .abortSignal(signal)
          .single(),
      );
      if (!request.current()) return;
      const current = paymentValue(result.data?.payment_status);
      if (result.error || !current) throw Error("STATUS_UNKNOWN");
      actual.current = { owner: identity, value: current };
      setState({
        owner: identity,
        value: current,
        feedback:
          selected && current === selected
            ? "saved"
            : selected
              ? "reconciled"
              : "idle",
        refreshWarning: false,
      });
      await refreshParent(request);
    } catch {
      if (request.current())
        setState({
          owner: identity,
          value: null,
          feedback: "unknown",
          refreshWarning: false,
        });
    }
  }
  async function change(next: Payment) {
    if (
      pending.current ||
      disabled ||
      !ready ||
      !session ||
      view.feedback === "unknown" ||
      next === view.value
    )
      return;
    if (
      next === "refunded" &&
      view.value !== "paid" &&
      view.value !== "refunded"
    )
      return;
    const request = start();
    setState({
      owner: identity,
      value: next,
      feedback: "saving",
      refreshWarning: false,
    });
    try {
      const result = await timed(request, (signal) =>
        storeClient()
          .rpc("set_order_payment", { p_id: orderId, p_payment: next })
          .abortSignal(signal),
      );
      if (!request.current()) return;
      if (result.error) throw result.error;
      actual.current = { owner: identity, value: next };
      setState({
        owner: identity,
        value: next,
        feedback: "saved",
        refreshWarning: false,
      });
      await refreshParent(request);
    } catch {
      if (request.current()) await reconcile(request, next);
    } finally {
      finish(request);
    }
  }
  async function reload() {
    if (pending.current || disabled || !ready || !session) return;
    const request = start();
    setState((previous) => ({
      ...previous,
      owner: identity,
      feedback: "saving",
    }));
    try {
      await reconcile(request);
    } finally {
      finish(request);
    }
  }
  const saving = pendingOwner === identity;
  const knownPayment =
    actual.current.owner === identity ? actual.current.value : payment;
  const canRefund = knownPayment === "paid" || knownPayment === "refunded";
  const statusId = `order-payment-status-${orderId}`;
  return (
    <div className="min-w-40 max-w-full">
      <label className="block text-sm font-semibold">
        {c.payment}
        <select
          className="store-field mt-1"
          value={view.value ?? ""}
          disabled={
            disabled ||
            saving ||
            view.feedback === "unknown" ||
            !ready ||
            !session
          }
          aria-describedby={statusId}
          onChange={(event) => {
            const value = paymentValue(event.target.value);
            if (value) void change(value);
          }}
        >
          {view.value === null && (
            <option value="" disabled>
              {ar ? "الحالة غير مؤكدة" : "Status not confirmed"}
            </option>
          )}
          {(["unpaid", "paid", "refunded"] as const)
            .filter((value) => value !== "refunded" || canRefund)
            .map((value) => (
              <option key={value} value={value}>
                {c[value]}
              </option>
            ))}
        </select>
      </label>
      <div
        id={statusId}
        className="mt-1 max-w-sm text-xs leading-5"
        aria-live="polite"
      >
        {saving && view.feedback === "saving" && (
          <p className="text-ink-muted">{ar ? "جارٍ الحفظ…" : "Saving…"}</p>
        )}
        {view.feedback === "saved" && (
          <p className="text-brand">{ar ? "تم الحفظ" : "Saved"}</p>
        )}
        {view.feedback === "reconciled" && (
          <p role="alert" className="text-destructive">
            {ar
              ? "لم يتأكد التغيير الذي اخترته. تُعرض الآن الحالة المحفوظة فعليًا."
              : "Your selected change was not confirmed. The current saved status is shown."}
          </p>
        )}
        {view.feedback === "unknown" && (
          <div role="alert" className="text-destructive">
            <p>
              {ar
                ? "تعذر التأكد من حالة الدفع. أعد تحميل الحالة قبل تغييرها مجددًا."
                : "We could not confirm the payment status. Reload it before making another change."}
            </p>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void reload()}
              className="min-h-11 rounded-lg font-semibold text-brand underline"
            >
              {ar ? "إعادة تحميل الحالة" : "Reload status"}
            </button>
          </div>
        )}
        {view.refreshWarning && (
          <p className="text-ink-muted">
            {ar
              ? "الحالة الحالية مؤكدة، لكن تعذر تحديث قائمة الطلبات. حدّث القائمة لعرضها."
              : "The current status is confirmed, but the order list could not refresh. Refresh the list to update it."}
          </p>
        )}
      </div>
    </div>
  );
}
