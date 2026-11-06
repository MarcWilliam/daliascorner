import { test } from "node:test";
import assert from "node:assert/strict";
import {
  oauthCallbackIssue,
  loadVerifiedRole,
} from "../lib/store/customer-auth";
import {
  customerProfileArgs,
  profileForUser,
  suggestedProfileName,
  type CustomerProfile,
} from "../lib/store/customer-profile";
test("OAuth cancellation is safely explained and cleaned without losing a private order fragment or attribution", () => {
  const result = oauthCallbackIssue(
    "https://shop.example/account/?utm_source=google&error=access_denied&error_description=untrusted#order=private-order-token",
  );
  assert.equal(result.issue, "cancelled");
  assert.equal(
    result.cleanPath,
    "/account/?utm_source=google#order=private-order-token",
  );
  assert.deepEqual(
    oauthCallbackIssue("https://shop.example/account/?code=oauth-code"),
    { issue: null, cleanPath: "/account/?code=oauth-code" },
  );
  assert.equal(
    oauthCallbackIssue(
      "https://shop.example/account/#error=server_error&error_description=untrusted",
    ).issue,
    "failed",
  );
});
test("verified access accepts only server boolean results and discards stale admin grants", async () => {
  assert.equal(
    await loadVerifiedRole(
      async () => ({ data: false, error: null }),
      () => true,
    ),
    false,
  );
  await assert.rejects(
    loadVerifiedRole(
      async () => ({ data: { role: "admin", is_admin: true }, error: null }),
      () => true,
    ),
    /ROLE_CHECK_FAILED/,
  );
  let current = true;
  const result = loadVerifiedRole(
    async () => {
      current = false;
      return { data: true, error: null };
    },
    () => current,
  );
  assert.equal(await result, null);
  await assert.rejects(
    loadVerifiedRole(
      async () => ({ data: true, error: Error("permission denied") }),
      () => true,
    ),
    /permission denied/,
  );
});
test("profile save contains only editable contact fields and permits name-only onboarding", () => {
  const args = customerProfileArgs({
    fullName: "  New Customer  ",
    phone: "",
    address: "",
    zone: "",
    role: "admin",
    user_id: "another-user",
  } as Parameters<typeof customerProfileArgs>[0]);
  assert.deepEqual(args, {
    p_full_name: "New Customer",
    p_phone: "",
    p_delivery_address: "",
    p_delivery_zone_id: null,
  });
  const profile = {
    user_id: "first-user",
    full_name: "Customer",
    phone: "",
    delivery_address: "",
    delivery_zone_id: null,
    completed_at: "2026-11-06",
    skipped_at: null,
    updated_at: "2026-11-06",
  } satisfies CustomerProfile;
  assert.equal(profileForUser(profile, "second-user"), null);
  assert.equal(profileForUser(profile, ""), null);
  assert.equal(profileForUser(profile, "first-user"), profile);
  assert.equal(
    suggestedProfileName({ full_name: "  Google\nName  ", role: "admin" }),
    "Google Name",
  );
});
test("profile contact validation rejects control characters including DEL and validates optional fields when provided", () => {
  const draft = { fullName: "Customer", phone: "", address: "", zone: "" };
  for (const fullName of ["x", "Customer\u007f", "Name\n"])
    assert.throws(
      () => customerProfileArgs({ ...draft, fullName }),
      /INVALID_NAME/,
    );
  for (const phone of ["123", "1+2345678", "\n", "\u007f"])
    assert.throws(
      () => customerProfileArgs({ ...draft, phone }),
      /INVALID_PHONE/,
    );
  for (const address of ["abc", "\n", "\u007f"])
    assert.throws(
      () => customerProfileArgs({ ...draft, address }),
      /INVALID_ADDRESS/,
    );
  assert.equal(
    customerProfileArgs({
      ...draft,
      phone: "+20 100 123 4567",
      address: "Example Street",
    }).p_phone,
    "+20 100 123 4567",
  );
});
