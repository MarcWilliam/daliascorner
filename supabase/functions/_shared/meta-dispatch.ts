export type MetaQueuedEvent = {
  id: string;
  order_id: string;
  event_name: string;
  event_time: string;
  lease_token: string;
};
export type MetaOrder = {
  source_url: string;
  marketing_consent: boolean;
  customer_phone: string;
  subtotal: number | string;
  delivery_fee: number | string;
  status: string;
  payment_status: string;
  meta_context: Record<string, unknown>;
  order_items: {
    product_id: string;
    quantity: number;
    unit_price: number | string;
  }[];
};
export type MetaDispatchDependencies = {
  loadOrder: (id: string) => Promise<MetaOrder>;
  stop: (event: MetaQueuedEvent) => Promise<void>;
  send: (payload: Record<string, unknown>) => Promise<void>;
  complete: (event: MetaQueuedEvent) => Promise<void>;
};
export function metaEventEligible(
  eventName: string,
  order: Pick<MetaOrder, "marketing_consent" | "status" | "payment_status">,
) {
  return (
    order.marketing_consent &&
    (eventName !== "Purchase" ||
      (order.payment_status === "paid" &&
        !["cancelled", "expired"].includes(order.status)))
  );
}
export async function dispatchMetaEvents(
  events: readonly MetaQueuedEvent[],
  deps: MetaDispatchDependencies,
) {
  const totals = { sent: 0, skipped: 0, failed: 0 };
  for (const event of events) {
    try {
      // Load current state immediately before sending; a queued paid flag may have been reversed.
      const order = await deps.loadOrder(event.order_id);
      if (!metaEventEligible(event.event_name, order)) {
        await deps.stop(event);
        totals.skipped++;
        continue;
      }
      let phone = order.customer_phone.replace(/\D/g, "");
      if (phone.startsWith("00")) phone = phone.slice(2);
      if (/^01\d{9}$/.test(phone)) phone = "20" + phone.slice(1);
      const phoneHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(phone),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      await deps.send({
        event_name: event.event_name,
        event_id: event.id,
        event_time: Math.floor(Date.parse(event.event_time) / 1000),
        action_source: "website",
        event_source_url: order.source_url,
        user_data: { ph: [phoneHash], ...(order.meta_context ?? {}) },
        custom_data: {
          currency: "EGP",
          value: Number(order.subtotal) + Number(order.delivery_fee),
          content_type: "product",
          contents: order.order_items.map((item) => ({
            id: item.product_id,
            quantity: item.quantity,
            item_price: item.unit_price,
          })),
        },
      });
      await deps.complete(event);
      totals.sent++;
    } catch {
      // The lease provides retry. Never log matching data, provider responses, or credentials.
      totals.failed++;
    }
  }
  return totals;
}
