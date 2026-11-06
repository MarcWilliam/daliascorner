import type { Customer } from "../whatsapp";

/** Keep customer feedback aligned with the server's order contract. */
export function checkoutIssue(
  customer: Customer,
  zone: string,
): "name" | "phone" | "address" | "zone" | null {
  const name = customer.name.trim();
  const phone = customer.phone.trim();
  const address = customer.address.trim();
  const controls = /[\u0000-\u001f]/;
  if (name.length < 2 || name.length > 120 || controls.test(customer.name))
    return "name";
  if (
    phone.length > 30 ||
    !/^\+?[\d\s()-]+$/.test(phone) ||
    phone.replace(/\D/g, "").length < 7 ||
    controls.test(customer.phone)
  )
    return "phone";
  if (
    address.length < 5 ||
    address.length > 500 ||
    controls.test(customer.address)
  )
    return "address";
  if (!zone) return "zone";
  return null;
}
