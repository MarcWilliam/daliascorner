export const AUTH_RETURN_KEY = "dc.auth.return";
export type AuthReturn = { path: string; checkout: boolean };
/** OAuth always returns to the allowlisted account URL; only local shop routes can resume. */
export function parseAuthReturn(value: unknown): AuthReturn | null {
  if (!value || typeof value !== "object") return null;
  const { path, checkout } = value as Partial<AuthReturn>;
  if (
    typeof path !== "string" ||
    !/^\/(?:(?:account|order|privacy)\/|characters\/[a-z0-9-]{1,100}\/)?$/.test(
      path,
    ) ||
    typeof checkout !== "boolean"
  )
    return null;
  return { path, checkout };
}
