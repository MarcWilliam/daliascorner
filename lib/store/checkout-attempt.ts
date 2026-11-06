export type CheckoutAttempt = {
  fingerprint: string;
  key: string;
  orderToken: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Preserve both identifiers on retries, even when persistent storage is blocked. */
export function checkoutAttempt(
  previous: unknown,
  fingerprint: string,
  newId: () => string,
): CheckoutAttempt {
  const p = previous as Partial<CheckoutAttempt> | null;
  if (
    p &&
    p.fingerprint === fingerprint &&
    typeof p.key === "string" &&
    typeof p.orderToken === "string" &&
    uuid.test(p.key) &&
    uuid.test(p.orderToken)
  )
    return p as CheckoutAttempt;
  return { fingerprint, key: newId(), orderToken: newId() };
}
