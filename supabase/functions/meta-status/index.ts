import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { metaPixel, metaVersion } from "../_shared/meta-config.ts";
let cached:
  | {
      at: number;
      quality: unknown;
      campaigns: unknown;
      quality_error: number | null;
      campaign_error: number | null;
    }
  | undefined;
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim());
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  const out = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers, status });
  if (req.method === "OPTIONS")
    return new Response(null, {
      status: allowed.includes(origin) ? 204 : 403,
      headers,
    });
  if (!["GET", "POST"].includes(req.method))
    return out({ error: "METHOD_NOT_ALLOWED" }, 405);
  const bearer =
    req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const operator =
    !!Deno.env.get("NOTIFY_SECRET") && bearer === Deno.env.get("NOTIFY_SECRET");
  if (!operator) {
    const { data, error } = await db.auth.getUser(bearer);
    if (error || !data.user) return out({ error: "UNAUTHORIZED" }, 401);
    const { data: admin } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!admin) return out({ error: "FORBIDDEN" }, 403);
  }
  const token = Deno.env.get("META_ACCESS_TOKEN");
  const pixel = metaPixel(),
    version = metaVersion();
  if (!token) return out({ configured: false });
  if (!/^\d+$/.test(pixel) || !/^v\d+\.\d+$/.test(version))
    return out({ error: "INVALID_CONFIGURATION" }, 503);
  try {
    if (req.method === "POST") {
      const body = await req.json();
      if (
        body.action !== "test" ||
        typeof body.test_code !== "string" ||
        !/^TEST\d{3,30}$/.test(body.test_code)
      )
        return out({ error: "TEST_CODE_REQUIRED" }, 400);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode("integration-test@example.com"),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const r = await fetch(
        `https://graph.facebook.com/${version}/${pixel}/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            test_event_code: body.test_code,
            data: [
              {
                event_name: "Lead",
                event_id: "setup-test-" + crypto.randomUUID(),
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                event_source_url: "https://dalias-corner.pages.dev/",
                user_data: {
                  em: [hash],
                  client_user_agent: "DaliasCorner integration verification",
                },
                custom_data: { currency: "EGP", value: 0 },
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const data = await r.json();
      return out(
        {
          accepted: r.ok && data.events_received === 1,
          error_code: data.error?.code ?? null,
        },
        r.ok ? 200 : 502,
      );
    }
    if (!cached || Date.now() - cached.at > 300000) {
      const query = async (fields: string) => {
        const url = new URL(
          `https://graph.facebook.com/${version}/dataset_quality`,
        );
        url.searchParams.set("dataset_id", pixel);
        url.searchParams.set("fields", fields);
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        const data = await r.json();
        return {
          data: r.ok ? (data.web ?? []) : [],
          code: r.ok ? null : (data.error?.code ?? r.status),
        };
      };
      const [quality, campaigns] = await Promise.all([
        query(
          "web{event_name,event_match_quality{composite_score},event_coverage{percentage,goal_percentage},data_freshness{upload_frequency,description}}",
        ),
        query(
          "web{event_name,event_spend{amount,currency_code},event_ad_sets{ad_set_id,ad_set_name,objective,spend_amount,spend_currency_code,event_use}}",
        ),
      ]);
      cached = {
        at: Date.now(),
        quality: quality.data,
        campaigns: campaigns.data,
        quality_error: quality.code,
        campaign_error: campaigns.code,
      };
    }
    const [pending, sent, failed] = await Promise.all([
      db
        .from("meta_events")
        .select("id", { head: true, count: "exact" })
        .is("sent_at", null)
        .lt("attempts", 8),
      db
        .from("meta_events")
        .select("id", { head: true, count: "exact" })
        .not("sent_at", "is", null),
      db
        .from("meta_events")
        .select("id", { head: true, count: "exact" })
        .is("sent_at", null)
        .gte("attempts", 8),
    ]);
    return out({
      configured: true,
      pixel,
      version,
      checked_at: new Date(cached.at).toISOString(),
      ...cached,
      pending: pending.count,
      sent: sent.count,
      failed: failed.count,
    });
  } catch {
    return out({ error: "META_UNAVAILABLE" }, 503);
  }
});
