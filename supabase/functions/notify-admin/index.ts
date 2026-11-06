import { dispatchMeta } from "../_shared/meta.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";

// Push endpoints are supplied by browsers but remain untrusted input (SSRF).
function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"),
    priv = Deno.env.get("VAPID_PRIVATE_KEY"),
    subject = Deno.env.get("VAPID_SUBJECT");
  if (!pub || !priv || !subject)
    return new Response("Push not configured", { status: 503 });
  webpush.setVapidDetails(subject, pub, priv);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  await dispatchMeta(db);
  const { data: admins, error: adminError } = await db
    .from("admin_users")
    .select("user_id");
  const { data: subscriptions, error: subError } = await db
    .from("push_subscriptions")
    .select("*");
  if (adminError || subError)
    return new Response("Unavailable", { status: 503 });
  const valid = (subscriptions ?? []).filter(
    (s) =>
      admins?.some((a) => a.user_id === s.user_id) &&
      allowedEndpoint(s.endpoint),
  );
  // Preserve pending notifications when no devices are enrolled yet.
  if (!valid.length) return Response.json({ processed: 0 });
  const { data: events, error } = await db.rpc("claim_notifications");
  if (error) return new Response("Unavailable", { status: 503 });
  for (const event of events ?? []) {
    let failed = false;
    // Generic lock-screen text avoids leaking customer data.
    const payload = JSON.stringify({
      title: "Dalia’s Corner",
      body:
        event.kind === "order"
          ? "New order · طلب جديد"
          : "Low stock · المخزون منخفض",
      tag: `store-${event.id}`,
      url: "/admin/",
    });
    for (const s of valid) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600, timeout: 10000 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        else failed = true;
      }
    }
    // Retries reuse the same notification tag. Network delivery is at least once.
    await db
      .from("admin_notifications")
      .update(
        failed
          ? { locked_until: new Date(Date.now() + 300000).toISOString() }
          : { sent_at: new Date().toISOString(), locked_until: null },
      )
      .eq("id", event.id)
      .eq("lease_token", event.lease_token);
  }
  return Response.json({ processed: events?.length ?? 0 });
});
