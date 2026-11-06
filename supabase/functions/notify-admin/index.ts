import { dispatchMeta } from "../_shared/meta.ts";
import {
  acknowledgeDispatch,
  dispatchPush,
  runDispatchWork,
} from "../_shared/push-dispatch.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";

// Supabase keeps this work alive after the HTTP acknowledgement, within runtime limits.
declare const EdgeRuntime: { waitUntil: (work: Promise<unknown>) => void };

Deno.serve((req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const processPush = async () => {
      const pub = Deno.env.get("VAPID_PUBLIC_KEY"),
        priv = Deno.env.get("VAPID_PRIVATE_KEY"),
        subject = Deno.env.get("VAPID_SUBJECT");
      if (!pub || !priv || !subject) throw new Error("PUSH_NOT_CONFIGURED");
      webpush.setVapidDetails(subject, pub, priv);
      const [admins, devices] = await Promise.all([
        db.from("admin_users").select("user_id"),
        db.from("push_subscriptions").select("user_id,endpoint,p256dh,auth"),
      ]);
      if (admins.error || devices.error)
        throw new Error("PUSH_DEVICES_UNAVAILABLE");
      return await dispatchPush({
        admins: (admins.data ?? []).map((admin) => admin.user_id),
        devices: devices.data ?? [],
        async claim() {
          const { data, error } = await db.rpc("claim_notifications");
          if (error) throw new Error("PUSH_QUEUE_UNAVAILABLE");
          return data ?? [];
        },
        async send(device, payload) {
          const response = await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth },
            },
            payload,
            { TTL: 3600, timeout: 10000 },
          );
          if (response.statusCode < 200 || response.statusCode >= 300)
            throw { statusCode: response.statusCode };
        },
        async removeDevice(device) {
          const { error } = await db
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", device.endpoint);
          if (error) throw new Error("PUSH_DEVICE_UPDATE_UNAVAILABLE");
        },
        async markSent(event, sentAt) {
          const { error } = await db
            .from("admin_notifications")
            .update({ sent_at: sentAt, locked_until: null })
            .eq("id", event.id)
            .eq("lease_token", event.lease_token);
          if (error) throw new Error("PUSH_EVENT_UPDATE_UNAVAILABLE");
        },
        async keepPending(event, retryAt, attempts) {
          const { error } = await db
            .from("admin_notifications")
            .update({
              locked_until: retryAt,
              ...(attempts === undefined ? {} : { attempts }),
            })
            .eq("id", event.id)
            .eq("lease_token", event.lease_token);
          if (error) throw new Error("PUSH_EVENT_UPDATE_UNAVAILABLE");
        },
      });
    };
    // Independent jobs prevent slow/failed Meta calls from blocking mobile alerts.
    // This acknowledges scheduling only. Queue state and phone receipt establish delivery.
    return acknowledgeDispatch(
      (work) => EdgeRuntime.waitUntil(work),
      () =>
        runDispatchWork(
          processPush,
          () => dispatchMeta(db),
          (worker) =>
            console.error(
              worker === "push"
                ? "Push dispatch unavailable"
                : "Meta dispatch unavailable",
            ),
        ),
    );
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
});
