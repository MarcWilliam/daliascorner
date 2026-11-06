"use client";
import { useState } from "react";
import { storeClient, STORE_CONFIGURED } from "@/lib/store/client";
import { ClayButton } from "@/components/ui/ClayButton";
export function FacebookReview() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function signIn() {
    setBusy(true);
    setError(false);
    try {
      const result = await storeClient().auth.signInWithOAuth({
        provider: "facebook",
        options: { scopes: "email", redirectTo: location.origin + "/account/" },
      });
      if (result.error) throw result.error;
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <main className="container-page py-12">
      <section className="mx-auto max-w-xl space-y-5 rounded-clay-lg border border-line bg-surface p-6">
        <a href="/" className="text-brand underline">
          Dalia’s Corner
        </a>
        <h1 className="text-2xl">Facebook Login — app review</h1>
        <p>
          This page is for Meta app reviewers and authorized app testers.
          Facebook limits sign-in to eligible test accounts until the app is
          approved.
        </p>
        <p>
          Sign-in requests your basic profile and email to identify your store
          account. It does not grant administrator access. After consent, you
          return to My account & orders, where you can sign out.
        </p>
        <ClayButton
          disabled={busy || !STORE_CONFIGURED}
          onClick={() => void signIn()}
        >
          {busy ? "Opening Facebook…" : "Continue with Facebook"}
        </ClayButton>
        {error && (
          <p role="alert">
            Unable to start Facebook sign-in. Please try again.
          </p>
        )}
        <p>
          <a href="/privacy/" className="text-brand underline">
            Privacy policy
          </a>{" "}
          ·{" "}
          <a href="/privacy/#account-deletion" className="text-brand underline">
            Account deletion instructions
          </a>
        </p>
      </section>
    </main>
  );
}
