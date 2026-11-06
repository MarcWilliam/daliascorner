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
    const input = parseOrder(body);
    // Fail closed: Turnstile must be configured, including during preview tests.
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) return respond({ error: "UNAVAILABLE" }, 503);
    if (
      typeof body.turnstileToken !== "string" ||
      body.turnstileToken.length > 2048
    )
      return respond({ error: "VERIFICATION_REQUIRED" }, 400);
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({ secret, response: body.turnstileToken }),
        signal: AbortSignal.timeout(10000),
      },
    ).then((r) => r.json());
    const hosts = allowed.map((s) => {
      try {
        return new URL(s).hostname;
      } catch {
        return "";
      }
    });
    if (
      !verification.success ||
      verification.action !== "checkout" ||
      !hosts.includes(verification.hostname)
    )
      return respond({ error: "VERIFICATION_REQUIRED" }, 400);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
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
          userId,
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
        .update({ meta_context: context, source_url: origin+"/" })
        .eq("idempotency_key", input.key);
    }
    return respond(data);
  } catch {
    return respond({ error: "INVALID_ORDER" }, 400);
  }
});
