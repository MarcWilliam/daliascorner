"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, UserRound } from "lucide-react";
import { useCustomerAuth } from "@/components/providers/CustomerAuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ClayButton } from "@/components/ui/ClayButton";
import { customerCopy } from "@/lib/store/customer-copy";
import {
  suggestedProfileName,
  type CustomerProfileDraft,
} from "@/lib/store/customer-profile";
import { storeClient } from "@/lib/store/client";

type Zone = { id: string; name_en: string; name_ar: string };
const field = "store-field mt-1.5";
export function CustomerProfile() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const c = customerCopy[locale];
  const {
    session,
    profile,
    profileReady,
    profileError,
    refreshProfile,
    saveProfile,
    skipProfile,
  } = useCustomerAuth();
  const [draft, setDraft] = useState<CustomerProfileDraft>({
    fullName: "",
    phone: "",
    address: "",
    zone: "",
  });
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState(false);
  const [zoneAttempt, setZoneAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const initialized = useRef(false);
  const guard = useRef(false);
  const identity = session?.user.id ?? "";
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const title = useRef<HTMLHeadingElement>(null);
  function restore() {
    setDraft({
      fullName:
        profile?.full_name || suggestedProfileName(session?.user.user_metadata),
      phone: profile?.phone ?? "",
      address: profile?.delivery_address ?? "",
      zone: profile?.delivery_zone_id ?? "",
    });
    setDirty(false);
  }
  useEffect(() => {
    if (!profileReady || profileError || dirty) return;
    setDraft({
      fullName:
        profile?.full_name || suggestedProfileName(session?.user.user_metadata),
      phone: profile?.phone ?? "",
      address: profile?.delivery_address ?? "",
      zone: profile?.delivery_zone_id ?? "",
    });
    if (!initialized.current) {
      setEditing(!profile?.completed_at && !profile?.skipped_at);
      initialized.current = true;
    }
  }, [profileReady, profileError, profile, session?.user.user_metadata, dirty]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setZonesLoading(true);
      setZonesError(false);
      try {
        const { data, error } = await storeClient()
          .from("delivery_zones")
          .select("id,name_en,name_ar")
          .eq("active", true)
          .order("name_en")
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) throw error;
        setZones(data);
      } catch {
        if (!controller.signal.aborted) setZonesError(true);
      } finally {
        if (!controller.signal.aborted) setZonesLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [identity, zoneAttempt]);
  function update(key: keyof CustomerProfileDraft, value: string) {
    setDirty(true);
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError("");
    setMessage("");
  }
  async function act(skip: boolean) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const user = identity;
    try {
      if (skip) await skipProfile();
      else await saveProfile(draft);
      if (currentIdentity.current !== user) return;
      setDirty(false);
      setEditing(false);
      setMessage(skip ? c.skipped : c.saved);
      title.current?.focus();
    } catch (error) {
      if (currentIdentity.current !== user) return;
      const code =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "";
      setError(
        code.includes("INVALID_NAME")
          ? c.invalidName
          : code.includes("INVALID_PHONE")
            ? c.invalidPhone
            : code.includes("INVALID_ADDRESS")
              ? c.invalidAddress
              : code.includes("INVALID_DELIVERY")
                ? c.invalidZone
                : code.includes("ACCOUNT_CHANGED") ||
                    code.includes("SIGN_IN_REQUIRED")
                  ? c.accountChanged
                  : c.saveError,
      );
      const target = code.includes("INVALID_NAME")
        ? "name"
        : code.includes("INVALID_PHONE")
          ? "phone"
          : code.includes("INVALID_ADDRESS")
            ? "address"
            : code.includes("INVALID_DELIVERY")
              ? "zone"
              : null;
      if (code.includes("INVALID_DELIVERY"))
        setZoneAttempt((value) => value + 1);
      if (target)
        document.getElementById(`customer-profile-${target}`)?.focus();
    } finally {
      guard.current = false;
      if (currentIdentity.current === user) setBusy(false);
    }
  }
  if (!session) return null;
  if (!profileReady)
    return (
      <p
        role="status"
        className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-muted"
      >
        {c.loading}
      </p>
    );
  if (profileError)
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p role="status" className="text-sm text-ink-muted">
          {c.profileError}
        </p>
        <button
          type="button"
          onClick={() => void refreshProfile()}
          className="mt-2 min-h-11 rounded-lg font-semibold text-brand underline"
        >
          {c.retry}
        </button>
      </section>
    );
  const previousZone =
    !!draft.zone &&
    !zonesLoading &&
    !zonesError &&
    !zones.some((zone) => zone.id === draft.zone);
  const savedZone = zones.find((zone) => zone.id === profile?.delivery_zone_id);
  return (
    <section
      className="rounded-3xl border border-line bg-surface p-5 sm:p-6"
      aria-labelledby="customer-profile-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-brand">
            <UserRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h2
              id="customer-profile-title"
              ref={title}
              tabIndex={-1}
              className="text-xl"
            >
              {!profile?.completed_at && editing ? c.welcome : c.profile}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {editing
                ? !profile?.completed_at
                  ? c.welcomeIntro
                  : c.profileIntro
                : !profile?.completed_at
                  ? c.profileLater
                  : profile.full_name}
            </p>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-brand"
            onClick={() => {
              restore();
              setEditing(true);
              setMessage("");
            }}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            {profile?.completed_at ? c.edit : c.complete}
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-leaf-soft/60 p-3 text-sm"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {editing ? (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void act(false);
          }}
        >
          <fieldset disabled={busy} className="space-y-4 border-0 p-0">
            <div>
              <p className="text-xs font-semibold text-ink-muted">{c.email}</p>
              <p className="mt-1 break-all text-sm">
                {session.user.email ?? "—"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{c.emailHint}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                {c.name}
                <input
                  id="customer-profile-name"
                  className={field}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={draft.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold">
                {c.phone}
                <input
                  id="customer-profile-phone"
                  className={field}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={30}
                  dir="ltr"
                  value={draft.phone}
                  onChange={(event) => update("phone", event.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              {c.address}
              <input
                id="customer-profile-address"
                className={field}
                maxLength={500}
                autoComplete="street-address"
                value={draft.address}
                onChange={(event) => update("address", event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              {c.zone}
              <select
                id="customer-profile-zone"
                className={field}
                value={draft.zone}
                disabled={zonesLoading || zonesError}
                onChange={(event) => update("zone", event.target.value)}
              >
                <option value="">{c.noZone}</option>
                {previousZone && (
                  <option value={draft.zone} disabled>
                    {c.previousZone}
                  </option>
                )}
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {ar ? zone.name_ar : zone.name_en}
                  </option>
                ))}
              </select>
            </label>
            {previousZone && (
              <p role="status" className="text-xs leading-5 text-ink-muted">
                {c.zoneUnavailable}
              </p>
            )}
            {zonesError && (
              <div role="status" className="text-xs leading-5 text-ink-muted">
                <p>{c.zonesError}</p>
                <button
                  type="button"
                  className="min-h-11 rounded-lg font-semibold text-brand underline"
                  disabled={zonesLoading}
                  onClick={() => setZoneAttempt((value) => value + 1)}
                >
                  {c.retry}
                </button>
                {draft.zone && (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg font-semibold text-brand underline"
                    onClick={() => update("zone", "")}
                  >
                    {c.clearArea}
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <ClayButton type="submit" disabled={busy} className="!rounded-xl">
                {busy ? c.saving : c.save}
              </ClayButton>
              {!profile?.completed_at ? (
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-12 rounded-xl px-3 font-semibold text-brand"
                  onClick={() => void act(true)}
                >
                  {c.skip}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-12 rounded-xl px-3 font-semibold text-brand"
                  onClick={() => {
                    restore();
                    setEditing(false);
                    setError("");
                  }}
                >
                  {c.cancel}
                </button>
              )}
            </div>
          </fieldset>
        </form>
      ) : (
        profile?.completed_at && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {profile.phone && (
              <div>
                <dt className="text-xs text-ink-muted">{c.phone}</dt>
                <dd className="mt-1" dir="ltr">
                  {profile.phone}
                </dd>
              </div>
            )}
            {profile.delivery_address && (
              <div>
                <dt className="text-xs text-ink-muted">{c.address}</dt>
                <dd className="mt-1 break-words">{profile.delivery_address}</dd>
              </div>
            )}
            {savedZone && (
              <div>
                <dt className="text-xs text-ink-muted">{c.zone}</dt>
                <dd className="mt-1">
                  {ar ? savedZone.name_ar : savedZone.name_en}
                </dd>
              </div>
            )}
          </dl>
        )
      )}
      <a
        href="/privacy/"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg text-xs text-ink-muted underline"
      >
        {c.privacy}
      </a>
    </section>
  );
}
