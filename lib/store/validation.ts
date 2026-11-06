export type OrderInput = {
  key: string;
  customer: { name: string; phone: string; address: string };
  lines: { id: string; qty: number }[];
  locale: "ar" | "en";
};
export function parseOrder(value: unknown): OrderInput {
  if (!value || typeof value !== "object") throw new Error("INVALID_ORDER");
  const v = value as Record<string, unknown>;
  const c = v.customer as Record<string, unknown> | undefined;
  if (
    typeof v.key !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.key,
    ) ||
    !c ||
    !["ar", "en"].includes(String(v.locale))
  )
    throw new Error("INVALID_ORDER");
  const field = (k: string, min: number, max: number) => {
    const s = c[k];
    if (
      typeof s !== "string" ||
      s.trim().length < min ||
      s.trim().length > max ||
      /[\u0000-\u001f]/.test(s)
    )
      throw new Error("INVALID_ORDER");
    return s.trim();
  };
  const customer = {
    name: field("name", 2, 120),
    phone: field("phone", 7, 30),
    address: field("address", 5, 500),
  };
  if (
    !/^\+?[\d\s()-]+$/.test(customer.phone) ||
    customer.phone.replace(/\D/g, "").length < 7
  )
    throw new Error("INVALID_ORDER");
  if (!Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 50)
    throw new Error("INVALID_ORDER");
  const ids = new Set<string>();
  const lines = v.lines
    .map((line: unknown) => {
      const l = line as Record<string, unknown> | null;
      if (
        !l ||
        typeof l.id !== "string" ||
        !/^[a-z0-9-]{1,100}$/.test(l.id) ||
        !Number.isInteger(l.qty) ||
        Number(l.qty) < 1 ||
        Number(l.qty) > 99 ||
        ids.has(l.id)
      )
        throw new Error("INVALID_ORDER");
      ids.add(l.id);
      return { id: l.id, qty: Number(l.qty) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { key: v.key, customer, lines, locale: v.locale as "ar" | "en" };
}
