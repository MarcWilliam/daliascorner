export type CustomerAuthIssue = "cancelled" | "failed" | "session" | null;
/** Provider descriptions are untrusted; expose only a small local message code. */
export function oauthCallbackIssue(url: string): {
  issue: CustomerAuthIssue;
  cleanPath: string;
} {
  const value = new URL(url);
  const fragment = new URLSearchParams(value.hash.slice(1));
  const failure =
    value.searchParams.get("error") ??
    value.searchParams.get("error_code") ??
    fragment.get("error") ??
    fragment.get("error_code");
  if (!failure)
    return {
      issue: null,
      cleanPath: value.pathname + value.search + value.hash,
    };
  const issue = /access_denied|cancel(?:led|ed)|user_denied/i.test(failure)
    ? "cancelled"
    : "failed";
  for (const key of ["error", "error_code", "error_description", "error_uri"]) {
    value.searchParams.delete(key);
    fragment.delete(key);
  }
  const hash = fragment.toString();
  return {
    issue,
    cleanPath: value.pathname + value.search + (hash ? `#${hash}` : ""),
  };
}
/** Role data must come from the authenticated server RPC, never profile metadata. */
export async function loadVerifiedRole(
  source: () => Promise<{ data: unknown; error: unknown }>,
  current: () => boolean,
): Promise<boolean | null> {
  if (!current()) return null;
  const { data, error } = await source();
  if (!current()) return null;
  if (error || typeof data !== "boolean")
    throw error ?? Error("ROLE_CHECK_FAILED");
  return data;
}
