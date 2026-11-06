import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("Pages builds fail instead of silently publishing a disconnected store", () => {
  const missing = spawnSync(process.execPath, ["scripts/check-build-env.mjs"], {
    env: { NODE_ENV: "test", PATH: process.env.PATH, CF_PAGES: "1" },
    encoding: "utf8",
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing Pages build configuration/);
  const configured = spawnSync(
    process.execPath,
    ["scripts/check-build-env.mjs"],
    {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        CF_PAGES: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-test-widget",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-test-push",
      },
      encoding: "utf8",
    },
  );
  assert.equal(configured.status, 0);
});
