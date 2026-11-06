import { metaPixel, metaVersion } from "./meta-config.ts";
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
  if (error) return;
  for (const e of events ?? []) {
    try {
      const { data: o, error } = await db
        .from("orders")
        .select(
          "source_url,marketing_consent,customer_phone,subtotal,delivery_fee,status,meta_context,order_items(product_id,quantity,unit_price)",
        )
        .eq("id", e.order_id)
        .single();
      if (error || !o) throw Error();
      if (
        !o.marketing_consent ||
        (e.event_name === "Purchase" &&
          ["cancelled", "expired"].includes(o.status))
      ) {
        await db
          .from("meta_events")
          .update({ attempts: 8 })
          .eq("id", e.id)
          .eq("lease_token", e.lease_token);
        continue;
      }
      let phone = o.customer_phone.replace(/\D/g, "");
      if (phone.startsWith("00")) phone = phone.slice(2);
      if (/^01\d{9}$/.test(phone)) phone = "20" + phone.slice(1);
      const ph = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(phone),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const event = {
        event_name: e.event_name,
        event_id: e.id,
        event_time: Math.floor(Date.parse(e.event_time) / 1000),
        action_source: "website",
        event_source_url: o.source_url,
        user_data: { ph: [ph], ...(o.meta_context ?? {}) },
        custom_data: {
          currency: "EGP",
          value: Number(o.subtotal) + Number(o.delivery_fee),
          content_type: "product",
          contents: o.order_items.map(
            (i: {
              product_id: string;
              quantity: number;
              unit_price: number;
            }) => ({
              id: i.product_id,
              quantity: i.quantity,
              item_price: i.unit_price,
            }),
          ),
        },
      };
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
      if (!response.ok || body.events_received !== 1) throw Error();
      await db
        .from("meta_events")
        .update({ sent_at: new Date().toISOString(), locked_until: null })
        .eq("id", e.id)
        .eq("lease_token", e.lease_token);
    } catch {
      /* Retry by lease; never log matching data or access tokens. */
    }
  }
}
