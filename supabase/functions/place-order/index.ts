import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { parseOrder } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim());
  const origin = req.headers.get("origin") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!allowed.includes(origin)) return respond({ error: "FORBIDDEN" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 16000) return respond({ error: "INVALID_ORDER" }, 400);
    const body = JSON.parse(raw);
    const secret =
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) return respond({ error: "UNAVAILABLE" }, 503);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
      auth: { persistSession: false },
    });
    // Counters live in Postgres so separate Edge isolates share the same limits.
    // HMAC prevents recovering phone/IP values from the private counter keys.
    const signingKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    async function consume(value: string, limit: number, seconds: number) {
      const bytes = await crypto.subtle.sign(
        "HMAC",
        signingKey,
        new TextEncoder().encode(value),
      );
      const key = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const result = await client.rpc("consume_checkout_limit", {
        p_key: key,
        p_limit: limit,
        p_seconds: seconds,
      });
      if (result.error) throw Error("LIMIT_UNAVAILABLE");
      return result.data === true;
    }
    const ip = (
      req.headers.get("x-real-ip") ??
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0] ??
      "unknown"
    )
      .trim()
      .slice(0, 128);
    if (
      !(await consume("global", 100, 600)) ||
      !(await consume("ip:" + ip, 20, 600))
    )
      return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
        status: 429,
        headers: { ...headers, "Retry-After": "600" },
      });
    if (
      body.website !== undefined &&
      (typeof body.website !== "string" || body.website.trim() !== "")
    )
      return respond({ error: "INVALID_ORDER" }, 400);
    const input = parseOrder(body);
    let phone = input.customer.phone.replace(/[^0-9]/g, "");
    if (phone.startsWith("0020")) phone = "0" + phone.slice(4);
    else if (phone.startsWith("20")) phone = "0" + phone.slice(2);
    if (!(await consume("phone:" + phone, 5, 3600)))
      return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
        status: 429,
        headers: { ...headers, "Retry-After": "3600" },
      });
    let userId: string | null = null;
    const authorization = req.headers.get("authorization");
    if (authorization) {
      const { data, error } = await client.auth.getUser(
        authorization.replace(/^Bearer /i, ""),
      );
      if (error || !data.user) return respond({ error: "SIGN_IN_AGAIN" }, 401);
      userId = data.user.id;
    }
    if (
      typeof body.orderToken !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.orderToken)
    )
      return respond({ error: "INVALID_ORDER" }, 400);
    const hashBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({
          customer: input.customer,
          lines: input.lines,
          locale: input.locale,
          zone: body.zone,
          payment: body.payment,
        }),
      ),
    );
    const hash = Array.from(new Uint8Array(hashBytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const { data, error } = await client.rpc("create_website_order", {
      p_key: input.key,
      p_hash: hash,
      p_customer: input.customer,
      p_lines: input.lines,
      p_locale: input.locale,
      p_token: body.orderToken,
      p_zone: body.zone,
      p_payment: body.payment,
      p_user: userId,
      p_consent: body.marketingConsent === true,
    });
    if (error) {
      const code = [
        "OUT_OF_STOCK",
        "IDEMPOTENCY_CONFLICT",
        "INVALID_ORDER",
        "INVALID_DELIVERY",
        "INVALID_PAYMENT",
        "ORDER_NOT_AVAILABLE",
      ].find((c) => error.message.includes(c));
      return respond({ error: code ?? "UNAVAILABLE" }, code ? 409 : 503);
    }
    if (body.marketingConsent === true) {
      const context: Record<string, string> = {
        client_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 512),
      };
      for (const key of ["fbp", "fbc"])
        if (
          typeof body[key] === "string" &&
          /^fb\.[0-9.]+[A-Za-z0-9_-]*$/.test(body[key]) &&
          body[key].length < 256
        )
          context[key] = body[key];
      await client
        .from("orders")
        .update({ meta_context: context, source_url: origin + "/" })
        .eq("idempotency_key", input.key);
    }
    return respond(data);
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT_UNAVAILABLE")
      return respond({ error: "UNAVAILABLE" }, 503);
    return respond({ error: "INVALID_ORDER" }, 400);
  }
});
