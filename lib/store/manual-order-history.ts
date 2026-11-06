/** Store dates are calendar days in Cairo, independent of the admin device's timezone. */
export function cairoDay(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1)
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function pastOrderDates(
  orderedOn: string,
  paid: boolean,
  paidOn: string,
  today = cairoDay(),
) {
  if (
    !validDay(orderedOn) ||
    orderedOn > today ||
    (paid && (!validDay(paidOn) || paidOn < orderedOn || paidOn > today))
  )
    throw Error("INVALID_DATE");
  return { orderedOn, paidOn: paid ? paidOn : null };
}
/** Blank means unknown; an explicitly entered zero is a known original cost. */
export function originalUnitCost(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const cost = Number(value);
  if (
    !Number.isFinite(cost) ||
    cost < 0 ||
    cost > 9999999999.99 ||
    Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001
  )
    throw Error("INVALID_COST");
  return cost;
}

/** Price preview and acknowledgement use integer cents, matching NUMERIC(12,2). */
export function manualOrderPricePreview(
  lines: { id: string; qty: number }[],
  prices: Record<string, number>,
  zone?: { id: string; fee: number },
) {
  const items = lines
    .map((line) => ({
      id: line.id,
      qty: line.qty,
      cents: Math.round(Number(prices[line.id] ?? 0) * 100),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const subtotalCents = items.reduce(
    (sum, line) => sum + line.cents * line.qty,
    0,
  );
  const delivery = zone
    ? { id: zone.id, cents: Math.round(Number(zone.fee) * 100) }
    : null;
  return {
    subtotal: subtotalCents / 100,
    total: delivery ? (subtotalCents + delivery.cents) / 100 : null,
    confirmationKey: JSON.stringify({ items, delivery }),
  };
}
