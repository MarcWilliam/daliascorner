// Public-API smoke test. Reads only publishable configuration; prints no keys.
import { readFileSync } from "node:fs";
const vars = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const base = vars.NEXT_PUBLIC_SUPABASE_URL;
const headers = {
  apikey: vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
};
const availability = await fetch(`${base}/rest/v1/rpc/store_availability`, {
  method: "POST",
  headers,
  body: "{}",
});
if (!availability.ok)
  throw new Error(`Availability failed: ${availability.status}`);
const rows = await availability.json();
if (!Array.isArray(rows) || !rows.length) throw new Error("Missing catalog");
for (const table of [
  "orders",
  "order_items",
  "admin_users",
  "stock_movements",
  "push_subscriptions",
  "product_costs",
  "order_item_costs",
  "finance_entries",
  "finance_payment_events",
]) {
  const response = await fetch(`${base}/rest/v1/${table}?select=*`, {
    headers,
  });
  if (![401, 403].includes(response.status))
    throw new Error(`Unexpected private-table response: ${table} ${response.status}`);
}
const finance = await fetch(`${base}/rest/v1/rpc/finance_overview`, {
  method: "POST", headers, body: "{}",
});
if (![401, 403].includes(finance.status))
  throw new Error(`Unexpected public finance response: ${finance.status}`);
const rejected = await fetch(`${base}/functions/v1/place-order`, {
  method: "POST",
  headers: { ...headers, Origin: "https://untrusted.example" },
  body: "{}",
});
if (rejected.status !== 403)
  throw new Error(`Unexpected origin result ${rejected.status}`);
const notify = await fetch(`${base}/functions/v1/notify-admin`, {
  method: "POST",
  headers,
  body: "{}",
});
if (notify.status !== 401)
  throw new Error(`Unexpected notification auth result ${notify.status}`);
console.log(
  `PASS: ${rows.length} public inventory rows; private tables denied; untrusted checkout origin and unauthenticated notification calls denied.`,
);
