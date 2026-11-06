export type ProgressItem = {
  quantity: number;
  shipped_quantity?: number;
  delivered_quantity?: number;
  removed_quantity?: number;
  returned_quantity?: number;
  returned_after_delivery_quantity?: number;
};
export function orderItemProgress(item: ProgressItem) {
  const removed = item.removed_quantity ?? 0;
  const returned = item.returned_quantity ?? 0;
  const shipped = item.shipped_quantity ?? 0;
  return {
    ordered: item.quantity,
    shipped,
    delivered: item.delivered_quantity ?? 0,
    removed,
    returned,
    closed:
      (item.delivered_quantity ?? 0) +
      returned -
      (item.returned_after_delivery_quantity ?? 0),
    billable: Math.max(0, item.quantity - removed - returned),
    remaining: Math.max(0, item.quantity - removed - shipped),
  };
}

export function orderProgressState(items: ProgressItem[], fallback: string) {
  if (["cancelled", "expired"].includes(fallback)) return fallback;
  const totals = items.map(orderItemProgress).reduce(
    (sum, p) => ({
      shipped: sum.shipped + p.shipped,
      returned: sum.returned + p.returned,
      delivered: sum.delivered + p.delivered,
      remaining: sum.remaining + p.remaining,
      closed: sum.closed + p.closed,
    }),
    { shipped: 0, returned: 0, delivered: 0, remaining: 0, closed: 0 },
  );
  if (totals.shipped > 0 && totals.returned >= totals.shipped)
    return totals.remaining > 0 ? "awaiting_replacement" : "returned";
  if (totals.closed >= totals.shipped && totals.remaining === 0)
    return fallback;
  if (totals.delivered > 0 && totals.delivered < totals.shipped)
    return "partially_delivered";
  if (totals.shipped > 0 && totals.remaining > 0) return "partially_shipped";
  return fallback;
}
export function progressStateLabel(state: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    partially_shipped: ["Partially shipped", "شُحن جزئيًا"],
    partially_delivered: ["Partially delivered", "سُلّم جزئيًا"],
    awaiting_replacement: ["Awaiting replacement", "في انتظار البديل"],
    returned: ["Returned", "مرتجع"],
  };
  return labels[state]?.[ar ? 1 : 0];
}
