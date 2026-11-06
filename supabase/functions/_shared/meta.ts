import { metaPixel, metaVersion } from "./meta-config.ts";
import { dispatchMetaEvents } from "./meta-dispatch.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
export async function dispatchMeta(db: SupabaseClient) {
  const token = Deno.env.get("META_ACCESS_TOKEN"),
    pixel = metaPixel(),
    version = metaVersion();
  if (
    !token ||
    !pixel ||
    !version ||
    !/^v\d+\.\d+$/.test(version) ||
    !/^\d+$/.test(pixel)
  )
    return;
  const { data: events, error } = await db.rpc("claim_meta_events");
  if (error) throw new Error("META_QUEUE_UNAVAILABLE");
  return await dispatchMetaEvents(events ?? [], {
    async loadOrder(id) {
      const { data, error } = await db
        .from("orders")
        .select(
          "source_url,marketing_consent,customer_phone,subtotal,delivery_fee,status,payment_status,meta_context,order_items(product_id,quantity,unit_price,removed_quantity,returned_quantity)",
        )
        .eq("id", id)
        .single();
      if (error || !data) throw new Error("META_ORDER_UNAVAILABLE");
      return data;
    },
    async stop(event) {
      const { error } = await db
        .from("meta_events")
        .update({ attempts: 8, locked_until: null })
        .eq("id", event.id)
        .eq("lease_token", event.lease_token);
      if (error) throw new Error("META_UPDATE_UNAVAILABLE");
    },
    async send(event) {
      const response = await fetch(
        `https://graph.facebook.com/${version}/${pixel}/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            data: [event],
            ...(Deno.env.get("META_TEST_EVENT_CODE")
              ? { test_event_code: Deno.env.get("META_TEST_EVENT_CODE") }
              : {}),
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const body = await response.json();
      if (!response.ok || body.events_received !== 1)
        throw new Error("META_NOT_ACCEPTED");
    },
    async complete(event) {
      const { error } = await db
        .from("meta_events")
        .update({ sent_at: new Date().toISOString(), locked_until: null })
        .eq("id", event.id)
        .eq("lease_token", event.lease_token);
      if (error) throw new Error("META_UPDATE_UNAVAILABLE");
    },
  });
}
