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
import { accountRequestScope } from "@/lib/store/customer-account";
import {
  loadVerifiedRole,
  oauthCallbackIssue,
  type CustomerAuthIssue,
} from "@/lib/store/customer-auth";
import {
  profileForUser,
  customerProfileArgs,
  type CustomerProfile,
  type CustomerProfileDraft,
} from "@/lib/store/customer-profile";
import { customerCopy } from "@/lib/store/customer-copy";
import { X, UserRound } from "lucide-react";
import { storeClient, STORE_CONFIGURED } from "@/lib/store/client";
import {
  CHECKOUT_GUEST_TRANSFER_KEY,
  deliveryDraftKey,
} from "@/lib/store/checkout-profile";
import { AUTH_RETURN_KEY, parseAuthReturn } from "@/lib/store/auth-return";
import { useCart } from "./CartProvider";
import { useLocale } from "./LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";

type CustomerAuth = {
  session: Session | null;
  ready: boolean;
  signIn: () => void;
  isAdmin: boolean;
  roleReady: boolean;
  roleError: boolean;
  refreshRole: () => Promise<boolean>;
  authIssue: CustomerAuthIssue;
  clearAuthIssue: () => void;
  profile: CustomerProfile | null;
  profileReady: boolean;
  profileError: boolean;
  refreshProfile: () => Promise<void>;
  clearProfile: () => void;
  saveProfile: (draft: CustomerProfileDraft) => Promise<CustomerProfile>;
  skipProfile: () => Promise<CustomerProfile>;
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
  const c = customerCopy[locale];
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!STORE_CONFIGURED);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [authIssue, setAuthIssue] = useState<CustomerAuthIssue>(null);
  const [role, setRole] = useState({
    userId: "",
    admin: false,
    ready: !STORE_CONFIGURED,
    error: false,
  });
  const userId = session?.user.id ?? "";
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const roleRequests = useRef(accountRequestScope());
  const clearAuthIssue = useCallback(() => setAuthIssue(null), []);
  const refreshRole = useCallback(async () => {
    const identity = currentUser.current;
    const request = roleRequests.current.begin();
    const current = () => request.current() && currentUser.current === identity;
    if (!identity || !STORE_CONFIGURED) {
      setRole({ userId: identity, admin: false, ready: true, error: false });
      return false;
    }
    setRole((previous) =>
      previous.userId === identity && previous.ready
        ? previous
        : { userId: identity, admin: false, ready: false, error: false },
    );
    const timeout = setTimeout(() => {
      if (current()) {
        setRole({ userId: identity, admin: false, ready: true, error: true });
        roleRequests.current.cancel();
      }
    }, 15000);
    try {
      const admin = await loadVerifiedRole(async () => {
        const { data, error } = await storeClient()
          .rpc("is_admin")
          .abortSignal(request.signal);
        return { data, error };
      }, current);
      if (admin !== null && current()) {
        setRole({ userId: identity, admin, ready: true, error: false });
        return admin;
      }
    } catch {
      if (current())
        setRole({ userId: identity, admin: false, ready: true, error: true });
    } finally {
      clearTimeout(timeout);
    }
    return false;
  }, []);
  useEffect(() => {
    void refreshRole();
    return () => roleRequests.current.cancel();
  }, [userId, refreshRole]);
  const [profileState, setProfileState] = useState<{
    userId: string;
    value: CustomerProfile | null;
    ready: boolean;
    error: boolean;
  }>({ userId: "", value: null, ready: !STORE_CONFIGURED, error: false });
  const profileRequests = useRef(accountRequestScope());
  const clearProfile = useCallback(() => {
    profileRequests.current.cancel();
    setProfileState({ userId: "", value: null, ready: true, error: false });
  }, []);
  const refreshProfile = useCallback(async () => {
    const identity = currentUser.current;
    const request = profileRequests.current.begin();
    const current = () => request.current() && currentUser.current === identity;
    if (!identity || !STORE_CONFIGURED) {
      setProfileState({
        userId: identity,
        value: null,
        ready: true,
        error: false,
      });
      return;
    }
    setProfileState((previous) => ({
      userId: identity,
      value: profileForUser(previous.value, identity),
      ready: false,
      error: false,
    }));
    const timeout = setTimeout(() => {
      if (current()) {
        setProfileState({
          userId: identity,
          value: null,
          ready: true,
          error: true,
        });
        profileRequests.current.cancel();
      }
    }, 15000);
    try {
      const { data, error } = await storeClient()
        .from("customer_profiles")
        .select(
          "user_id,full_name,phone,delivery_address,delivery_zone_id,completed_at,skipped_at,updated_at",
        )
        .eq("user_id", identity)
        .abortSignal(request.signal)
        .maybeSingle();
      if (!current()) return;
      if (error || (data && data.user_id !== identity))
        throw error ?? Error("PROFILE_IDENTITY_MISMATCH");
      setProfileState({
        userId: identity,
        value: data as CustomerProfile | null,
        ready: true,
        error: false,
      });
    } catch {
      if (current())
        setProfileState({
          userId: identity,
          value: null,
          ready: true,
          error: true,
        });
    } finally {
      clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    void refreshProfile();
    return () => profileRequests.current.cancel();
  }, [userId, refreshProfile]);
  const writeProfile = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const identity = currentUser.current;
      if (!identity) throw Error("SIGN_IN_REQUIRED");
      const request = profileRequests.current.begin();
      const { data, error } = await storeClient()
        .rpc(name, args)
        .abortSignal(AbortSignal.timeout(15000));
      if (!request.current() || currentUser.current !== identity)
        throw Error("ACCOUNT_CHANGED");
      if (error) throw error;
      if (!data || data.user_id !== identity)
        throw Error("PROFILE_IDENTITY_MISMATCH");
      const value = data as CustomerProfile;
      setProfileState({ userId: identity, value, ready: true, error: false });
      return value;
    },
    [],
  );
  const saveProfile = useCallback(
    (draft: CustomerProfileDraft) =>
      writeProfile("save_customer_profile", customerProfileArgs(draft)),
    [writeProfile],
  );
  const skipProfile = useCallback(
    () => writeProfile("skip_customer_onboarding", {}),
    [writeProfile],
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const resumeCart = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!STORE_CONFIGURED) return;
    const callback = oauthCallbackIssue(location.href);
    if (callback.issue) {
      setAuthIssue(callback.issue);
      try {
        localStorage.removeItem(AUTH_RETURN_KEY);
      } catch {}
      try {
        sessionStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
      } catch {}
      history.replaceState(null, "", callback.cleanPath);
    }
    let active = true;
    let authEventSeen = false;
    const db = storeClient();
    const { data } = db.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authEventSeen = true;
      if (event === "SIGNED_OUT") {
        try {
          if (currentUser.current)
            localStorage.removeItem(
              deliveryDraftKey(`user:${currentUser.current}`),
            );
        } catch {}
        try {
          sessionStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
        } catch {}
      }
      const nextUser = next?.user.id ?? "";
      if (currentUser.current !== nextUser) {
        roleRequests.current.cancel();
        profileRequests.current.cancel();
        setRole({
          userId: nextUser,
          admin: false,
          ready: !nextUser,
          error: false,
        });
        setProfileState({
          userId: nextUser,
          value: null,
          ready: !nextUser,
          error: false,
        });
      }
      currentUser.current = nextUser;
      setSession(next);
      setReady(true);
    });
    void db.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authEventSeen) return;
        currentUser.current = data.session?.user.id ?? "";
        setSession(data.session);
        setReady(true);
        if (error) setAuthIssue("session");
      })
      .catch(() => {
        if (active && !authEventSeen) {
          setReady(true);
          setAuthIssue("session");
        }
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const signIn = useCallback(() => {
    trigger.current = document.activeElement as HTMLElement;
    resumeCart.current = isOpen;
    closeCart();
    setError(false);
    setAuthIssue(null);
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
    setError(false);
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
      try {
        if (resumeCart.current && !currentUser.current)
          sessionStorage.setItem(
            CHECKOUT_GUEST_TRANSFER_KEY,
            JSON.stringify({ at: Date.now() }),
          );
        else sessionStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
      } catch {
        /* A blocked marker prevents transferring a guest draft; sign-in still works. */
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
      setError(true);
      try {
        localStorage.removeItem(AUTH_RETURN_KEY);
      } catch {}
      try {
        sessionStorage.removeItem(CHECKOUT_GUEST_TRANSFER_KEY);
      } catch {}
      setBusy(false);
    }
  }
  const google = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true";
  const facebook = process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED === "true";
  return (
    <Context.Provider
      value={{
        session,
        ready,
        signIn,
        isAdmin: role.userId === userId && role.ready && role.admin,
        roleReady: !userId || (role.userId === userId && role.ready),
        roleError: !!userId && role.userId === userId && role.error,
        refreshRole,
        authIssue,
        clearAuthIssue,
        profile: profileForUser(profileState.value, userId),
        profileReady:
          !userId || (profileState.userId === userId && profileState.ready),
        profileError:
          !!userId && profileState.userId === userId && profileState.error,
        refreshProfile,
        clearProfile,
        saveProfile,
        skipProfile,
      }}
    >
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
          {c.authTitle}
        </h2>
        <p
          id="customer-signin-description"
          className="mt-3 text-sm leading-6 text-ink-muted"
        >
          {c.authDescription}
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {c.authOptional}
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
              {c.failed}
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
