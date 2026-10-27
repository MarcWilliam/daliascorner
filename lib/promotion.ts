/** Seven calendar days in Cairo, including the October daylight-saving change. */
export const SALE_START = "2026-10-27T00:00:00+03:00";
export const SALE_END = "2026-11-03T00:00:00+02:00";
export const SALE_PERCENT = 20;

export function isSaleActive(now = Date.now()): boolean {
  return now >= Date.parse(SALE_START) && now < Date.parse(SALE_END);
}

/** Always derive from the regular price, never compound a previously applied sale. */
export function salePricing<T extends { price?: number; originalPrice?: number }>(
  product: T,
  active = isSaleActive(),
): T {
  const regular = product.originalPrice ?? product.price;
  if (regular == null) return product;
  return {
    ...product,
    price: active ? Math.round(regular * (100 - SALE_PERCENT)) / 100 : regular,
    originalPrice: active ? regular : undefined,
  };
}
