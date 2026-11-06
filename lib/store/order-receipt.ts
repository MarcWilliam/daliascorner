type ReceiptState = { status: string; payment_status: string; expires_at: string };
/** Paid pending orders retain their reservation until an admin ships/cancels them. */
export function receiptExpired(order: ReceiptState, now = Date.now()): boolean {
  return ["expired", "cancelled"].includes(order.status) ||
    (order.status === "pending" && order.payment_status !== "paid" && Date.parse(order.expires_at) <= now);
}
