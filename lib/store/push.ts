import { storeClient } from "./client";
import { asset } from "../asset";
export async function enablePush(userId: string) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error("UNSUPPORTED");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("NOT_CONFIGURED");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("DENIED");
  await navigator.serviceWorker.register(asset("/admin-sw.js"), {
    scope: asset("/admin/"),
  });
  const registration = await navigator.serviceWorker.ready;
  const decoded = atob(
    key
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(key.length / 4) * 4, "="),
  );
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  let sub = await registration.pushManager.getSubscription();
  if (!sub)
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    });
  const data = sub.toJSON();
  const { error } = await storeClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: data.keys?.p256dh,
        auth: data.keys?.auth,
      },
      { onConflict: "endpoint" },
    );
  if (error) throw error;
}
export async function disablePush() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(asset("/admin/"));
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const { error } = await storeClient()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", sub.endpoint);
    if (error) throw error;
    await sub.unsubscribe();
  }
}
