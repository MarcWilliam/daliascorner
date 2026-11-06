/** One account refresh owns the result until superseded, cancelled, or signed out. */
export function accountRequestScope() {
  let active: AbortController | null = null;
  return {
    cancel() { active?.abort(); active = null; },
    begin() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return {
        signal: controller.signal,
        current: () => active === controller && !controller.signal.aborted,
      };
    },
  };
}

type Source<T> = {
  claim: () => Promise<boolean>;
  ownOrders: () => Promise<T[]>;
  guestOrder: () => Promise<T | null>;
};
/** Check freshness between requests, so stale claims cannot start a new read. */
export async function loadCustomerAccount<T>(
  signedIn: boolean,
  hasGuest: boolean,
  source: Source<T>,
  current: () => boolean,
): Promise<{ orders: T[]; attached: boolean; claimed: boolean } | null> {
  if (!current()) return null;
  if (signedIn) {
    const attached = !hasGuest || await source.claim();
    if (!current()) return null;
    const orders = await source.ownOrders();
    if (!current()) return null;
    return { orders, attached, claimed: hasGuest && attached };
  }
  const order = hasGuest ? await source.guestOrder() : null;
  if (!current()) return null;
  return { orders: order ? [order] : [], attached: true, claimed: false };
}
