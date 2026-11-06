export type ManualOrderAttempt = {
  fingerprint: string;
  key: string;
  token: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Retain retries through an ambiguous network failure, including failed storage writes. */
export function manualOrderAttempt(
  memory: unknown,
  persisted: unknown,
  fingerprint: string,
  newId: () => string,
): ManualOrderAttempt {
  for (const value of [memory, persisted]) {
    const attempt = value as Partial<ManualOrderAttempt> | null;
    if (
      attempt &&
      attempt.fingerprint === fingerprint &&
      typeof attempt.key === "string" &&
      uuid.test(attempt.key) &&
      typeof attempt.token === "string" &&
      uuid.test(attempt.token)
    ) {
      return { fingerprint, key: attempt.key, token: attempt.token };
    }
  }
  return { fingerprint, key: newId(), token: newId() };
}
