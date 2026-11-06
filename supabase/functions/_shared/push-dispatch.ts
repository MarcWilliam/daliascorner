export type PushDevice = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
export type PushEvent = {
  id: number | string;
  kind: string;
  lease_token: string;
  attempts: number;
};
export type PushDispatchDependencies = {
  admins: readonly string[];
  devices: readonly PushDevice[];
  claim: () => Promise<PushEvent[]>;
  // A resolved send means the push provider accepted the message, not delivery to a phone.
  send: (device: PushDevice, payload: string) => Promise<void>;
  removeDevice: (device: PushDevice) => Promise<void>;
  markSent: (event: PushEvent, sentAt: string) => Promise<void>;
  keepPending: (
    event: PushEvent,
    retryAt: string,
    attempts?: number,
  ) => Promise<void>;
  now?: () => number;
};

// Browser-supplied endpoints remain untrusted input; restrict outbound providers.
export function allowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

export async function dispatchPush(deps: PushDispatchDependencies) {
  const adminIds = new Set(deps.admins);
  const active = new Map(
    deps.devices
      .filter(
        (device) =>
          adminIds.has(device.user_id) && allowedPushEndpoint(device.endpoint),
      )
      .map((device) => [device.endpoint, device]),
  );
  const totals = { claimed: 0, accepted: 0, sent: 0, pending: 0, stale: 0 };
  // Keep attempts available until an admin enrolls a usable device.
  if (!active.size) return totals;
  const events = await deps.claim();
  totals.claimed = events.length;
  const now = deps.now ?? Date.now;
  for (const event of events) {
    let accepted = 0,
      transientFailure = false;
    const payload = JSON.stringify({
      title: "Dalia’s Corner",
      body:
        event.kind === "order"
          ? "New order · طلب جديد"
          : "Low stock · المخزون منخفض",
      tag: `store-${event.id}`,
      url: "/admin/",
    });
    for (const device of active.values()) {
      try {
        await deps.send(device, payload);
        accepted++;
        totals.accepted++;
      } catch (failure) {
        const status = (failure as { statusCode?: number } | null)?.statusCode;
        if (status === 404 || status === 410) {
          active.delete(device.endpoint);
          totals.stale++;
          try {
            await deps.removeDevice(device);
          } catch {
            transientFailure = true;
          }
        } else transientFailure = true;
      }
    }
    // A stale-only batch has zero acceptances. Preserve it for re-enrollment.
    // Mixed acceptance and transient failure retries all current devices with the same tag.
    if (accepted > 0 && !transientFailure) {
      await deps.markSent(event, new Date(now()).toISOString());
      totals.sent++;
    } else {
      await deps.keepPending(
        event,
        new Date(now() + 300000).toISOString(),
        // No usable device is not an exhausted delivery attempt. In particular,
        // a stale endpoint on attempt eight must not strand the event forever.
        accepted === 0 && !transientFailure && active.size === 0
          ? Math.max(0, event.attempts - 1)
          : undefined,
      );
      totals.pending++;
    }
  }
  return totals;
}

// Run independent workers immediately; an error in either must not cancel the other.
export async function runDispatchWork(
  push: () => Promise<unknown>,
  meta: () => Promise<unknown>,
  onError: (worker: "push" | "meta") => void,
) {
  const run = async (worker: "push" | "meta", task: () => Promise<unknown>) => {
    try {
      await task();
    } catch {
      onError(worker);
    }
  };
  await Promise.all([run("push", push), run("meta", meta)]);
}

export function acknowledgeDispatch(
  waitUntil: (work: Promise<unknown>) => void,
  work: () => Promise<unknown>,
) {
  waitUntil(Promise.resolve().then(work));
  return Response.json({ accepted: true }, { status: 202 });
}
