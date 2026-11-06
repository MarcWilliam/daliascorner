import {
  restoreCheckoutAttempt,
  type CheckoutAttempt,
} from "./checkout-attempt";
export type OwnedCheckoutAttempt = CheckoutAttempt & { owner: string };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Guest/legacy retries retain their credentials; the server enforces existing order ownership. */
export function checkoutAttemptForOwner(
  value: unknown,
  owner: string,
): OwnedCheckoutAttempt | null {
  const attempt = value as Partial<OwnedCheckoutAttempt> | null;
  if (
    !attempt ||
    typeof attempt.fingerprint !== "string" ||
    typeof attempt.key !== "string" ||
    !uuid.test(attempt.key) ||
    typeof attempt.orderToken !== "string" ||
    !uuid.test(attempt.orderToken) ||
    (attempt.owner !== undefined &&
      attempt.owner !== owner &&
      !(attempt.owner === "guest" && owner !== "guest"))
  )
    return null;
  return {
    fingerprint: attempt.fingerprint,
    key: attempt.key,
    orderToken: attempt.orderToken,
    owner,
  };
}
export function restoreOwnedCheckoutAttempt(
  memory: unknown,
  persisted: unknown,
  fingerprint: string,
  owner: string,
  newId: () => string,
): OwnedCheckoutAttempt {
  return {
    ...restoreCheckoutAttempt(
      checkoutAttemptForOwner(memory, owner),
      checkoutAttemptForOwner(persisted, owner),
      fingerprint,
      newId,
    ),
    owner,
  };
}
/** Cancellation invalidates commits; a timeout abort may still publish its own retry error. */
export function checkoutRequestScope() {
  let active: { owner: string; controller: AbortController } | null = null;
  return {
    busy(owner: string) {
      return active?.owner === owner;
    },
    invalidateOwner(owner: string) {
      if (active && active.owner !== owner) {
        active.controller.abort();
        active = null;
      }
    },
    cancel() {
      active?.controller.abort();
      active = null;
    },
    begin(owner: string) {
      active?.controller.abort();
      const request = { owner, controller: new AbortController() };
      active = request;
      const current = (identity: string) =>
        active === request && identity === owner;
      return {
        signal: request.controller.signal,
        current,
        abort: () => request.controller.abort(),
        finish(identity: string) {
          if (!current(identity)) return false;
          active = null;
          return true;
        },
      };
    },
  };
}
