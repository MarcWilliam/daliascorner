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
  "customer_profiles",
]) {
  const response = await fetch(`${base}/rest/v1/${table}?select=*`, {
    headers,
  });
  if (![401, 403].includes(response.status))
    throw new Error(
      `Unexpected private-table response: ${table} ${response.status}`,
    );
}
const finance = await fetch(`${base}/rest/v1/rpc/finance_overview`, {
  method: "POST",
  headers,
  body: "{}",
});
if (![401, 403].includes(finance.status))
  throw new Error(`Unexpected public finance response: ${finance.status}`);
const expenses = await fetch(`${base}/rest/v1/rpc/expense_page`, {
  method: "POST",
  headers,
  body: "{}",
});
if (![401, 403].includes(expenses.status))
  throw new Error(`Unexpected public expenses response: ${expenses.status}`);
const chat = await fetch(`${base}/rest/v1/rpc/create_chat_order`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    p_key: crypto.randomUUID(),
    p_token: crypto.randomUUID(),
    p_customer: {},
    p_lines: [],
    p_locale: "en",
    p_zone: crypto.randomUUID(),
    p_payment: "cash",
    p_paid: false,
  }),
});
if (![401, 403].includes(chat.status))
  throw new Error(`Unexpected public chat-order response: ${chat.status}`);
const pastChat = await fetch(`${base}/rest/v1/rpc/create_past_chat_order`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    p_key: crypto.randomUUID(),
    p_token: crypto.randomUUID(),
    p_customer: {},
    p_lines: [],
    p_locale: "en",
    p_zone: crypto.randomUUID(),
    p_payment: "cash",
    p_ordered_on: "2026-01-01",
    p_paid: false,
    p_paid_on: null,
    p_stock_handling: "already_accounted",
    p_expected_total: 0,
  }),
});
if (![401, 403].includes(pastChat.status))
  throw new Error(`Unexpected public past-order response: ${pastChat.status}`);
for (const [name, body] of [
  ["save_customer_profile", { p_full_name: "Public TEST" }],
  ["skip_customer_onboarding", {}],
]) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (![401, 403].includes(response.status))
    throw new Error(
      `Unexpected public profile response: ${name} ${response.status}`,
    );
}
for (const [name, body] of [
  ["admin_order_detail", { p_id: crypto.randomUUID() }],
  [
    "admin_order_action",
    {
      p_id: crypto.randomUUID(),
      p_revision: 0,
      p_key: crypto.randomUUID(),
      p_action: "note",
      p_payload: { text: "TEST denied request" },
      p_reason: "TEST denied request",
    },
  ],
  ["finance_recent_payments", { p_limit: 1 }],
]) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (![401, 403].includes(response.status))
    throw new Error(
      `Unexpected public order-operation response: ${name} ${response.status}`,
    );
}
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
