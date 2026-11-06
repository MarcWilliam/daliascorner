import type { Customer } from "../whatsapp";
import type { CustomerProfile } from "./customer-profile";
import { STORAGE_CUSTOMER } from "../config";

export const CHECKOUT_GUEST_TRANSFER_KEY = "dc.checkout.guest-transfer";
export type DeliveryTouched = Record<keyof Customer, boolean>;
export const emptyCustomer = (): Customer => ({
  name: "",
  phone: "",
  address: "",
});
export const untouchedDelivery = (): DeliveryTouched => ({
  name: false,
  phone: false,
  address: false,
});
export const deliveryDraftKey = (scope: string) =>
  `${STORAGE_CUSTOMER}.${scope}`;
export function readDeliveryDraft(value: unknown): {
  customer: Customer;
  touched: DeliveryTouched;
} {
  const customer = emptyCustomer(),
    touched = untouchedDelivery();
  if (!value || typeof value !== "object") return { customer, touched };
  const fields = value as Partial<Customer>;
  for (const key of ["name", "phone", "address"] as const) {
    if (typeof fields[key] === "string") {
      customer[key] = fields[key].slice(
        0,
        key === "name" ? 120 : key === "phone" ? 30 : 500,
      );
      touched[key] = true;
    }
  }
  return { customer, touched };
}
/** Persist only explicit edits, not defaults fetched from another authenticated source. */
export function deliveryEdits(
  customer: Customer,
  touched: DeliveryTouched,
): Partial<Customer> {
  return Object.fromEntries(
    Object.entries(customer).filter(([key]) => touched[key as keyof Customer]),
  );
}
export function applyProfileDelivery(
  customer: Customer,
  touched: DeliveryTouched,
  profile: CustomerProfile | null,
  userId: string,
): Customer {
  if (!userId || profile?.user_id !== userId || !profile.completed_at)
    return customer;
  return {
    name: touched.name ? customer.name : profile.full_name,
    phone: touched.phone ? customer.phone : profile.phone,
    address: touched.address ? customer.address : profile.delivery_address,
  };
}
/** A one-time guest handoff belongs only to the checkout OAuth return, never an account switch. */
export function validGuestTransfer(
  marker: unknown,
  path: string,
  search: string,
  now = Date.now(),
): boolean {
  if (
    !marker ||
    typeof marker !== "object" ||
    !("at" in marker) ||
    typeof marker.at !== "number"
  )
    return false;
  const age = now - marker.at;
  return (
    age >= 0 &&
    age <= 15 * 60000 &&
    (path === "/account/" ||
      new URLSearchParams(search).get("checkout") === "1")
  );
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Copy before removing guest data: the account callback may navigate immediately. */
export function restoreDeliveryDraft(
  scope: string,
  path: string,
  search: string,
  storage: DraftStorage,
  transferStorage: DraftStorage,
  now = Date.now(),
) {
  const parse = (value: string | null): unknown => {
    try {
      return JSON.parse(value ?? "null");
    } catch {
      return null;
    }
  };
  try {
    storage.removeItem(STORAGE_CUSTOMER);
  } catch {}
  let value: unknown = null;
  try {
    value = parse(storage.getItem(deliveryDraftKey(scope)));
  } catch {}
  if (!scope.startsWith("user:")) return readDeliveryDraft(value);
  let marker: unknown = null;
  try {
    marker = parse(transferStorage.getItem(CHECKOUT_GUEST_TRANSFER_KEY));
  } catch {}
  if (validGuestTransfer(marker, path, search, now)) {
    let guest: string | null = null;
    try {
      guest = storage.getItem(deliveryDraftKey("guest"));
    } catch {}
    if (guest !== null) {
      const restored = readDeliveryDraft(parse(guest));
      try {
        storage.setItem(
          deliveryDraftKey(scope),
          JSON.stringify(deliveryEdits(restored.customer, restored.touched)),
        );
      } catch {
        // Preserve the handoff for the following checkout navigation if quota blocks the copy.
        return restored;
      }
      try {
        storage.removeItem(deliveryDraftKey("guest"));
      } catch {}
      try {
        transferStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
      } catch {}
      return restored;
    }
  }
  try {
    storage.removeItem(deliveryDraftKey("guest"));
  } catch {}
  try {
    transferStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
  } catch {}
  return readDeliveryDraft(value);
}
