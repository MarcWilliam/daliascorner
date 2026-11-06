import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfileDelivery,
  deliveryDraftKey,
  deliveryEdits,
  emptyCustomer,
  readDeliveryDraft,
  untouchedDelivery,
  validGuestTransfer,
  restoreDeliveryDraft,
  CHECKOUT_GUEST_TRANSFER_KEY,
} from "../lib/store/checkout-profile";
import type { CustomerProfile } from "../lib/store/customer-profile";
const profile: CustomerProfile = {
  user_id: "alice",
  full_name: "Alice",
  phone: "01000000000",
  delivery_address: "Profile address",
  delivery_zone_id: null,
  completed_at: "2026-11-06T10:00:00Z",
  skipped_at: null,
  updated_at: "2026-11-06T10:00:00Z",
};
test("delivery defaults never cross accounts and do not overwrite explicit edits or cleared fields", () => {
  assert.equal(
    applyProfileDelivery(emptyCustomer(), untouchedDelivery(), profile, "bob")
      .name,
    "",
  );
  assert.equal(
    applyProfileDelivery(
      emptyCustomer(),
      untouchedDelivery(),
      { ...profile, completed_at: null },
      "alice",
    ).name,
    "",
  );
  assert.deepEqual(
    applyProfileDelivery(
      { name: "Gift recipient", phone: "", address: "" },
      { name: true, phone: true, address: false },
      profile,
      "alice",
    ),
    { name: "Gift recipient", phone: "", address: "Profile address" },
  );
  const updated = { ...profile, delivery_address: "Updated profile address" };
  assert.equal(
    applyProfileDelivery(
      profileToCustomer(profile),
      untouchedDelivery(),
      updated,
      "alice",
    ).address,
    "Updated profile address",
  );
  assert.notEqual(deliveryDraftKey("user:alice"), deliveryDraftKey("user:bob"));
  assert.notEqual(deliveryDraftKey("guest"), deliveryDraftKey("user:alice"));
});

test("checkout OAuth moves guest details before redirect and preserves a quota-failed handoff", () => {
  const values = new Map<string, string>();
  let quota = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (quota && key.includes("user:")) throw Error("quota");
      values.set(key, value);
    },
  };
  const now = 1800000;
  storage.setItem(
    deliveryDraftKey("guest"),
    JSON.stringify({
      name: "Guest recipient",
      address: "Guest delivery draft",
    }),
  );
  storage.setItem(
    CHECKOUT_GUEST_TRANSFER_KEY,
    JSON.stringify({ at: now - 1000 }),
  );
  quota = true;
  assert.equal(
    restoreDeliveryDraft("user:alice", "/account/", "", storage, storage, now)
      .customer.name,
    "Guest recipient",
  );
  assert.notEqual(storage.getItem(deliveryDraftKey("guest")), null);
  assert.notEqual(storage.getItem(CHECKOUT_GUEST_TRANSFER_KEY), null);
  quota = false;
  restoreDeliveryDraft(
    "user:alice",
    "/characters/azza/",
    "?checkout=1",
    storage,
    storage,
    now,
  );
  assert.equal(storage.getItem(deliveryDraftKey("guest")), null);
  assert.equal(storage.getItem(CHECKOUT_GUEST_TRANSFER_KEY), null);
  assert.equal(
    restoreDeliveryDraft(
      "user:alice",
      "/characters/azza/",
      "",
      storage,
      storage,
      now,
    ).customer.address,
    "Guest delivery draft",
  );
  assert.equal(
    restoreDeliveryDraft("user:bob", "/account/", "", storage, storage, now)
      .customer.name,
    "",
  );
});
function profileToCustomer(p: CustomerProfile) {
  return { name: p.full_name, phone: p.phone, address: p.delivery_address };
}
test("stored delivery drafts persist only explicit edits and handle corrupt values", () => {
  assert.deepEqual(
    deliveryEdits(profileToCustomer(profile), {
      name: false,
      phone: true,
      address: false,
    }),
    { phone: profile.phone },
  );
  const restored = readDeliveryDraft({ phone: "", address: "Typed draft" });
  assert.deepEqual(restored.touched, {
    name: false,
    phone: true,
    address: true,
  });
  assert.deepEqual(
    applyProfileDelivery(restored.customer, restored.touched, profile, "alice"),
    { name: "Alice", phone: "", address: "Typed draft" },
  );
  assert.deepEqual(readDeliveryDraft({ name: 123 }), {
    customer: emptyCustomer(),
    touched: untouchedDelivery(),
  });
});
test("guest delivery transfer requires a recent explicit checkout OAuth return", () => {
  const now = 1800000;
  assert.equal(
    validGuestTransfer({ at: now - 1000 }, "/account/", "", now),
    true,
  );
  assert.equal(
    validGuestTransfer(
      { at: now - 1000 },
      "/characters/azza/",
      "?checkout=1",
      now,
    ),
    true,
  );
  for (const [marker, path, search] of [
    [{ at: now - 1000 }, "/", ""],
    [{ at: now - 16 * 60000 }, "/account/", ""],
    [{ at: now + 1 }, "/account/", ""],
    [{}, "/account/", ""],
  ] as const)
    assert.equal(validGuestTransfer(marker, path, search, now), false);
});
