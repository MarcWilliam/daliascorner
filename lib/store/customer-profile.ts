export type CustomerProfile = {
  user_id: string;
  full_name: string;
  phone: string;
  delivery_address: string;
  delivery_zone_id: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  updated_at: string;
};
export type CustomerProfileDraft = {
  fullName: string;
  phone: string;
  address: string;
  zone: string;
};
export function profileForUser(
  value: CustomerProfile | null,
  userId: string,
): CustomerProfile | null {
  return userId && value?.user_id === userId ? value : null;
}
/** Google names are an editable suggestion only; no metadata field grants access. */
export function suggestedProfileName(
  metadata: Record<string, unknown> | undefined,
): string {
  const value = metadata?.full_name ?? metadata?.name;
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, 120)
    : "";
}
/** Only customer-editable fields cross the RPC boundary. Email, identity and role are server-owned. */
export function customerProfileArgs(value: CustomerProfileDraft) {
  const name = value.fullName.trim();
  const phone = value.phone.trim();
  const address = value.address.trim();
  const controls = /[\u0000-\u001f\u007f]/;
  if (name.length < 2 || name.length > 120 || controls.test(value.fullName))
    throw Error("INVALID_NAME");
  if (
    controls.test(value.phone) ||
    (phone &&
      (phone.length > 30 ||
        !/^\+?[\d ()-]+$/.test(phone) ||
        phone.replace(/\D/g, "").length < 7))
  )
    throw Error("INVALID_PHONE");
  if (
    controls.test(value.address) ||
    (address && (address.length < 5 || address.length > 500))
  )
    throw Error("INVALID_ADDRESS");
  return {
    p_full_name: name,
    p_phone: phone,
    p_delivery_address: address,
    p_delivery_zone_id: value.zone || null,
  };
}
