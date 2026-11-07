export type AdjustmentItem = {
  id: number;
  product_id: string;
  name_en: string;
  name_ar: string;
  quantity: number;
  unit_price: number;
  reserved_quantity: number;
  stock_tracked?: boolean;
  shipped_quantity: number;
  delivered_quantity: number;
  removed_quantity: number;
  returned_quantity: number;
  returned_after_delivery_quantity?: number;
  restocked_quantity: number;
};
export type AdjustmentShipment = {
  legacy_delivered?: boolean;
  id: string;
  courier?: string;
  tracking_number?: string;
  dispatched_on?: string;
  expected_on?: string | null;
  delivered_on?: string | null;
  voided_at?: string | null;
  created_at?: string;
  lines?: { item_id: number; quantity: number; returned_quantity?: number }[];
};
export type AdjustmentPayment = {
  id: number;
  event_type: string;
  amount: number;
  occurred_at?: string | null;
  reference?: string;
  recorded_at?: string;
};
export type AdjustmentEvent = {
  id: number | string;
  action?: string;
  kind?: string;
  event_type?: string;
  reason?: string;
  created_at?: string;
  occurred_at?: string;
  actor_id?: string | null;
  actor_label?: string;
  payload?: Record<string, unknown>;
  text?: string;
  returned_on?: string;
  lines?: { item_id: number; quantity: number; restock?: boolean }[];
};
export type OrderAdjustmentDetail = {
  order: {
    id: string;
    order_number: number;
    revision: number;
    ops_managed: boolean;
    status: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    locale: "en" | "ar";
    delivery_zone_id: string | null;
    delivery_zone?: string;
    subtotal: number;
    delivery_fee: number;
    order_total?: number;
    expires_at?: string;
    ordered_at?: string;
    is_historical?: boolean;
  };
  items: AdjustmentItem[];
  shipments: AdjustmentShipment[];
  returns: AdjustmentEvent[];
  timeline: AdjustmentEvent[];
  notes: AdjustmentEvent[];
  finance: {
    payments: AdjustmentPayment[];
    net_collected: number;
    balance_due: number;
    refund_due: number;
    payment_state: string;
    cost_policy?: string;
  };
};
export function remainingUnits(item: AdjustmentItem) {
  return Math.max(
    0,
    Number(item.quantity) -
      Number(item.removed_quantity || 0) -
      Number(item.shipped_quantity || 0),
  );
}
export function returnableUnits(item: AdjustmentItem) {
  return Math.max(
    0,
    Number(item.shipped_quantity || 0) - Number(item.returned_quantity || 0),
  );
}
export function activeUnits(item: AdjustmentItem) {
  return Math.max(
    0,
    Number(item.quantity) - Number(item.removed_quantity || 0),
  );
}
/** Use this order's holds first, then share free stock across lines for the same product. */
export function suggestedShipmentQuantities(
  items: AdjustmentItem[],
  inventory: { product_id: string; on_hand: number; reserved: number }[],
) {
  const freeStock = new Map(inventory.map((product) => [
    product.product_id,
    Math.max(0, Number(product.on_hand) - Number(product.reserved)),
  ]));
  const quantities = new Map<number, number>();
  for (const item of items) {
    const remaining = Math.min(99, remainingUnits(item));
    const held = Math.min(remaining, Number(item.reserved_quantity || 0));
    const free = freeStock.get(item.product_id) ?? 0;
    const tracked = item.stock_tracked !== false;
    const quantity = tracked ? Math.min(remaining, held + free) : remaining;
    if (quantity <= 0) continue;
    quantities.set(item.id, quantity);
    if (tracked) freeStock.set(item.product_id, free - (quantity - held));
    if (quantities.size === 100) break;
  }
  return quantities;
}
export type AdjustmentAttempt = { body: string; key: string; revision: number };
/** An ambiguous mutation retains both its key and original revision after reads refresh. */
export function adjustmentAttempt(
  previous: AdjustmentAttempt | undefined,
  body: string,
  revision: number,
  createKey: () => string,
): AdjustmentAttempt {
  return previous?.body === body
    ? previous
    : { body, key: createKey(), revision };
}
