import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parseOrder } from "../lib/store/validation";

type RpcCall = { name: string; args: Record<string, unknown> };
type Options = { limit?: "allow" | "deny" | "error"; auth?: "valid" | "invalid" };
function fixture(options: Options = {}) {
  const calls: RpcCall[] = [];
  const authTokens: string[] = [];
  let handle!: (request: Request) => Promise<Response>;
  const client = {
    auth: { getUser: async (token: string) => {
      authTokens.push(token);
      return options.auth === "invalid"
        ? { data: { user: null }, error: { message: "Invalid token" } }
        : { data: { user: { id: "trusted-user-id" } }, error: null };
    } },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "consume_checkout_limit") return {
        data: options.limit !== "deny",
        error: options.limit === "error" ? { message: "Database unavailable" } : null,
      };
      if (name === "create_website_order") return {
        data: { order_number: 123, status: "pending", payment_status: "unpaid" }, error: null,
      };
      throw Error(`Unexpected RPC ${name}`);
    },
    from: () => { throw Error("Unexpected direct order-table mutation"); },
  };
  const source = readFileSync("supabase/functions/place-order/index.ts", "utf8")
    .replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const env: Record<string, string> = {
    ALLOWED_ORIGINS: "https://shop.example.test",
    SUPABASE_URL: "https://backend.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-backend-key",
  };
  new Function("Deno", "createClient", "parseOrder", "fetch", js)(
    { env: { get: (name: string) => env[name] }, serve: (fn: typeof handle) => { handle = fn; } },
    () => client, parseOrder,
    () => { throw Error("Checkout must not call Turnstile or any remote verification service"); },
  );
  return { calls, authTokens, handle };
}
function request(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("https://backend.example.test/functions/v1/place-order", {
    method: "POST", headers: { Origin: "https://shop.example.test", "Content-Type": "application/json", "x-real-ip": "192.0.2.10", ...headers },
    body: JSON.stringify({
      key: "00000000-0000-4000-8000-000000000001", orderToken: "00000000-0000-4000-8000-000000000002",
      customer: { name: "Synthetic customer", phone: "01012345678", address: "Synthetic address" },
      lines: [{ id: "azza", qty: 1 }], locale: "en", zone: "00000000-0000-4000-8000-000000000003", payment: "cash",
      website: "", marketingConsent: false, ...overrides,
    }),
  });
}
test("checkout edge rejects disallowed origins and honeypot submissions before order mutation", async () => {
  const f = fixture();
  assert.equal((await f.handle(request({}, { Origin: "https://untrusted.example" }))).status, 403);
  assert.equal((await f.handle(request({ website: "spam.example" }))).status, 400);
  assert.equal(f.calls.filter(c => c.name === "create_website_order").length, 0);
});
test("checkout rate denial and limiter failure cannot reserve stock or create an order", async () => {
  for (const [limit, status] of [["deny", 429], ["error", 503]] as const) {
    const f = fixture({ limit });
    assert.equal((await f.handle(request())).status, status);
    assert.equal(f.calls.filter(c => c.name === "create_website_order").length, 0);
  }
});
test("guest checkout succeeds without a CAPTCHA and limits use hashed identifiers only", async () => {
  const f = fixture();
  const response = await f.handle(request({ p_user: "spoofed-user" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order_number, 123);
  const limits = f.calls.filter(c => c.name === "consume_checkout_limit");
  assert.equal(limits.length, 3);
  for (const call of limits) {
    assert.match(String(call.args.p_key), /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(call.args).includes("01012345678"), false);
    assert.equal(JSON.stringify(call.args).includes("192.0.2.10"), false);
  }
  const order = f.calls.find(c => c.name === "create_website_order")!;
  assert.equal(order.args.p_user, null);
});
test("checkout identifies a signed-in customer only through the validated bearer token", async () => {
  const valid = fixture({ auth: "valid" });
  assert.equal((await valid.handle(request({ p_user: "spoofed-user" }, { Authorization: "Bearer actual-token" }))).status, 200);
  assert.deepEqual(valid.authTokens, ["actual-token"]);
  assert.equal(valid.calls.find(c => c.name === "create_website_order")!.args.p_user, "trusted-user-id");
  const invalid = fixture({ auth: "invalid" });
  assert.equal((await invalid.handle(request({}, { Authorization: "Bearer forged-token" }))).status, 401);
  assert.equal(invalid.calls.filter(c => c.name === "create_website_order").length, 0);
});
