import { readFileSync } from "node:fs";
const env = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
const pub = env(".env.local"),
  priv = env(".env.push.local");
const test = process.argv[2];
const r = await fetch(
  pub.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/meta-status",
  {
    method: test ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${priv.NOTIFY_SECRET}`,
      "Content-Type": "application/json",
    },
    ...(test
      ? { body: JSON.stringify({ action: "test", test_code: test }) }
      : {}),
  },
);
const d = await r.json();
console.log(
  JSON.stringify({
    http: r.status,
    configured: d.configured,
    quality_error: d.quality_error,
    campaign_error: d.campaign_error,
    quality_events: Array.isArray(d.quality) ? d.quality.length : undefined,
    campaign_events: Array.isArray(d.campaigns)
      ? d.campaigns.length
      : undefined,
    accepted: d.accepted,
    error_code: d.error_code,
    error: d.error,
  }),
);
