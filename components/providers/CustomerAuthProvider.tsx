"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { X, UserRound } from "lucide-react";
import { storeClient, STORE_CONFIGURED } from "@/lib/store/client";
import { AUTH_RETURN_KEY, parseAuthReturn } from "@/lib/store/auth-return";
import { useCart } from "./CartProvider";
import { useLocale } from "./LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";

type CustomerAuth = {
  session: Session | null;
  ready: boolean;
  signIn: () => void;
};
const Context = createContext<CustomerAuth | null>(null);
export function useCustomerAuth() {
  const value = useContext(Context);
  if (!value) throw Error("CustomerAuthProvider missing");
  return value;
}
export function CustomerAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isOpen, close: closeCart, open: openCart } = useCart();
  const { locale, dir } = useLocale();
  const ar = locale === "ar";
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!STORE_CONFIGURED);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const resumeCart = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!STORE_CONFIGURED) return;
    let active = true;
    void storeClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
          if (error)
            setError(
              ar
                ? "تعذر تحميل الحساب. حاول مرة أخرى."
                : "Could not load your account. Please try again.",
            );
        }
      });
    const { data } = storeClient().auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [ar]);
  const signIn = useCallback(() => {
    trigger.current = document.activeElement as HTMLElement;
    resumeCart.current = isOpen;
    closeCart();
    setError("");
    setShown(true);
  }, [isOpen, closeCart]);
  const dismiss = useCallback(() => {
    setShown(false);
    setBusy(false);
    if (resumeCart.current) {
      resumeCart.current = false;
      openCart();
    } else requestAnimationFrame(() => trigger.current?.focus());
  }, [openCart]);
  useEffect(() => {
    if (!shown) {
      dialog.current?.close();
      return;
    }
    // Wait for the drawer to leave the interaction tree before opening a modal.
    const timer = requestAnimationFrame(() => dialog.current?.showModal());
    // The drawer owns body overflow. Lock the root so dismissing this modal
    // cannot overwrite the drawer's new scroll lock when checkout resumes.
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(timer);
      document.documentElement.style.overflow = overflow;
    };
  }, [shown]);
  async function social(provider: "google" | "facebook") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const destination = parseAuthReturn({
        path: location.pathname,
        checkout: resumeCart.current,
      });
      try {
        if (destination)
          localStorage.setItem(AUTH_RETURN_KEY, JSON.stringify(destination));
      } catch {
        /* Sign-in still returns to the account page when storage is blocked. */
      }
      const { error } = await storeClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: location.origin + "/account/",
          ...(provider === "facebook" ? { scopes: "email" } : {}),
        },
      });
      if (error) throw error;
    } catch {
      setError(
        ar
          ? "تعذر بدء تسجيل الدخول. حاول مرة أخرى، أو تابع كضيف."
          : "Could not start sign-in. Try again, or continue as a guest.",
      );
      setBusy(false);
    }
  }
  const google = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true";
  const facebook = process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED === "true";
  return (
    <Context.Provider value={{ session, ready, signIn }}>
      {children}
      <dialog
        ref={dialog}
        dir={dir}
        aria-labelledby="customer-signin-title"
        aria-describedby="customer-signin-description"
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) {
            const rect = dialog.current.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              dismiss();
          }
        }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-3xl border border-line bg-canvas p-6 text-ink shadow-clay-lg backdrop:bg-ink/40 backdrop:backdrop-blur-sm sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-leaf-soft text-brand">
            <UserRound aria-hidden="true" />
          </span>
          <button
            type="button"
            aria-label={ar ? "إغلاق" : "Close"}
            onClick={dismiss}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <h2
          id="customer-signin-title"
          className="font-display text-2xl font-bold"
        >
          {ar ? "أهلًا بك في دالياز كورنر" : "Welcome to Dalia’s Corner"}
        </h2>
        <p
          id="customer-signin-description"
          className="mt-3 text-sm leading-6 text-ink-muted"
        >
          {ar
            ? "سجّل الدخول أو أنشئ حسابًا لمتابعة طلباتك. يمكنك أيضًا إكمال الطلب كضيف."
            : "Sign in or create an account to keep your orders together. You can also check out as a guest."}
        </p>
        <div className="mt-6 space-y-3">
          {google && (
            <ClayButton
              className="w-full !rounded-xl"
              variant="outline"
              disabled={busy}
              onClick={() => void social("google")}
            >
              {busy
                ? ar
                  ? "جارٍ الاتصال…"
                  : "Connecting…"
                : ar
                  ? "المتابعة باستخدام Google"
                  : "Continue with Google"}
            </ClayButton>
          )}
          {facebook && (
            <ClayButton
              className="w-full !rounded-xl"
              variant="outline"
              disabled={busy}
              onClick={() => void social("facebook")}
            >
              {ar ? "المتابعة باستخدام Facebook" : "Continue with Facebook"}
            </ClayButton>
          )}
          {!google && !facebook && (
            <p className="text-sm text-ink-muted">
              {ar
                ? "تسجيل الدخول قيد الإعداد. الطلب كضيف متاح."
                : "Sign-in is being set up. Guest checkout is available."}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="min-h-12 w-full rounded-xl font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {ar ? "متابعة التصفح" : "Continue shopping"}
          </button>
        </div>
        <p className="mt-5 text-center text-xs text-ink-muted">
          <a href="/privacy/" className="underline">
            {ar ? "الخصوصية وحسابك" : "Privacy & your account"}
          </a>
        </p>
      </dialog>
    </Context.Provider>
  );
}
