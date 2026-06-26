"use client";

import { Smartphone } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useDeviceTilt } from "@/components/providers/DeviceTiltProvider";

/**
 * iOS-only nudge to switch on the gyroscope lean.
 *
 * iOS gates motion sensors behind a permission prompt that must be triggered by
 * a user gesture, so we surface a small pill to request it. It renders only when
 * the provider reports `status === "prompt"` (iOS · touch · sensor present ·
 * not yet enabled). Android starts ambiently and never shows this; desktop never
 * does either. Touch-drag tilt works with or without it, so this is pure
 * enhancement — tapping it upgrades the cards to whole-grid device tilt.
 */
export function TiltPrompt() {
  const { t } = useLocale();
  const tilt = useDeviceTilt();
  if (tilt.status !== "prompt") return null;
  return (
    <div className="mt-5 flex justify-center">
      <button
        type="button"
        onClick={tilt.enable}
        className="inline-flex animate-rise-in items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-muted shadow-clay-sm transition-colors [touch-action:manipulation] cursor-pointer hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45"
      >
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        {t("characters.tiltHint")}
      </button>
    </div>
  );
}
