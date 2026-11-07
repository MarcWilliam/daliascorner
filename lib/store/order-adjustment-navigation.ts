import {
  remainingUnits,
  type OrderAdjustmentDetail,
} from "./order-adjustments";

export type AdjustmentSection =
  | "details"
  | "items"
  | "shipping"
  | "payments"
  | "returns"
  | "history"
  | "recovery";
export type NextOrderAction = {
  kind:
    | "confirm"
    | "extend"
    | "reopen"
    | "ship"
    | "deliver"
    | "payment"
    | "refund"
    | "history";
  section: AdjustmentSection;
  correction?: "confirm" | "extend" | "reopen";
};

export function canConfirmOrder(
  detail: OrderAdjustmentDetail,
  now = Date.now(),
) {
  const { order, finance } = detail;
  return (
    order.status === "pending" &&
    (Number(finance?.net_collected) > 0 ||
      !order.expires_at ||
      Date.parse(order.expires_at) > now)
  );
}

/** Guidance only: it never changes order state or disables another workflow. */
export function nextOrderAction(
  detail: OrderAdjustmentDetail,
  now = Date.now(),
): NextOrderAction {
  const { order, finance, items, shipments } = detail;
  if (Number(finance?.refund_due) > 0)
    return { kind: "refund", section: "payments" };
  if (order.status === "pending")
    return canConfirmOrder(detail, now)
      ? { kind: "confirm", section: "recovery", correction: "confirm" }
      : { kind: "extend", section: "recovery", correction: "extend" };
  if (["cancelled", "expired"].includes(order.status))
    return !order.is_historical &&
      !items.some((item) => item.shipped_quantity > 0)
      ? { kind: "reopen", section: "recovery", correction: "reopen" }
      : { kind: "history", section: "history" };
  if (
    ["confirmed", "shipped"].includes(order.status) &&
    items.some((item) => remainingUnits(item) > 0)
  )
    return { kind: "ship", section: "shipping" };
  if (
    (!order.ops_managed && order.status === "shipped") ||
    shipments.some(
      (shipment) =>
        !shipment.voided_at &&
        !shipment.delivered_on &&
        !shipment.legacy_delivered &&
        (shipment.lines?.some(
          (line) => line.quantity > Number(line.returned_quantity ?? 0),
        ) ??
          true),
    )
  )
    return { kind: "deliver", section: "shipping" };
  if (Number(finance?.balance_due) > 0)
    return { kind: "payment", section: "payments" };
  return { kind: "history", section: "history" };
}
