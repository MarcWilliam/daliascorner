"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMotionValue, useReducedMotion, type MotionValue } from "framer-motion";
import { CARD_GYRO } from "@/lib/motion";

/**
 * Shared gyroscope tilt source for the character grid.
 *
 * One `deviceorientation` listener feeds two shared MotionValues (-1…1) that
 * every CharacterCard reads, so the whole grid leans together as the phone is
 * physically tilted — and there's a single listener, not one per card. The
 * values bypass React render (MotionValues), so 60 Hz sensor updates are cheap.
 *
 * Platform reality this wraps:
 *  • iOS (Safari + every iOS browser) gates the sensor behind
 *    `DeviceOrientationEvent.requestPermission()`, which MUST be called from a
 *    user gesture → status `"prompt"`, surfaced as a tap-to-enable affordance.
 *  • Android Chrome (and the rest) expose it freely on a secure origin → we
 *    auto-start → status `"active"`.
 *  • Desktop / no touch / reduced-motion → status `"unsupported"`; the cards
 *    fall back to mouse (desktop) or touch-drag (any phone) tilt on their own.
 */

type TiltStatus = "unsupported" | "prompt" | "active" | "denied";

interface DeviceTiltValue {
  status: TiltStatus;
  /** Request the sensor from a user gesture (needed on iOS; harmless elsewhere). */
  enable: () => void;
  /** Normalized left/right lean, -1…1 → drives rotateY. */
  tiltX: MotionValue<number>;
  /** Normalized front/back lean, -1…1 → drives rotateX. */
  tiltY: MotionValue<number>;
}

const DeviceTiltContext = createContext<DeviceTiltValue | null>(null);

interface OrientationEventStatic {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/** iOS 13+ exposes a static requestPermission() — its presence means we must ask. */
function needsPermission(): boolean {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return false;
  }
  const ctor = window.DeviceOrientationEvent as unknown as OrientationEventStatic;
  return typeof ctor.requestPermission === "function";
}

/** Coarse pointer ≈ a real touch device with an accelerometer (skips desktops). */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window
  );
}

/** Map a raw axis delta (degrees from neutral) into a deadzoned, clamped -1…1. */
function normalize(delta: number): number {
  const clamped = Math.max(-CARD_GYRO.range, Math.min(CARD_GYRO.range, delta));
  if (Math.abs(clamped) < CARD_GYRO.deadzone) return 0;
  return clamped / CARD_GYRO.range;
}

/** Current screen rotation in degrees (0 = portrait), best-effort across APIs. */
function screenAngle(): number {
  if (typeof window === "undefined") return 0;
  const fromApi = window.screen?.orientation?.angle;
  if (typeof fromApi === "number") return fromApi;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

export function DeviceTiltProvider({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<TiltStatus>("unsupported");

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);

  // First reading after each (re)start becomes "neutral" — calibrates to however
  // the visitor happens to be holding the phone, instead of a guessed upright.
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);

  const handleOrientation = useCallback(
    (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0; // front/back, ~ -180…180
      const gamma = e.gamma ?? 0; // left/right, ~ -90…90
      if (!baseline.current) {
        baseline.current = { beta, gamma };
        return;
      }
      const dBeta = beta - baseline.current.beta;
      const dGamma = gamma - baseline.current.gamma;

      // Portrait is the design case; in landscape the physical axes swap roles.
      const angle = screenAngle();
      const landscape = angle === 90 || angle === -90 || angle === 270;
      if (landscape) {
        const sign = angle === 90 ? 1 : -1;
        tiltX.set(normalize(sign * dBeta));
        tiltY.set(normalize(sign * dGamma));
      } else {
        // Lean right (gamma↑) → right edge recedes (rotateY+). Lean back
        // (beta↓) → top recedes (rotateX+), matching "looking down at it".
        tiltX.set(normalize(dGamma));
        tiltY.set(normalize(-dBeta));
      }
    },
    [tiltX, tiltY],
  );

  // Attach the sensor listeners and recalibrate neutral on orientation flips.
  const startListening = useCallback(() => {
    baseline.current = null;
    const recalibrate = () => {
      baseline.current = null;
    };
    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("orientationchange", recalibrate);
    setStatus("active");
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("orientationchange", recalibrate);
    };
  }, [handleOrientation]);

  // Keep the active listener's teardown so enable()/unmount can both detach it.
  const detach = useRef<(() => void) | null>(null);

  const enable = useCallback(() => {
    if (typeof window === "undefined") return;
    const ctor = window.DeviceOrientationEvent as unknown as OrientationEventStatic;
    if (typeof ctor.requestPermission === "function") {
      ctor
        .requestPermission()
        .then((res) => {
          if (res === "granted") {
            detach.current?.();
            detach.current = startListening();
          } else {
            setStatus("denied");
          }
        })
        .catch(() => setStatus("denied"));
    } else {
      detach.current?.();
      detach.current = startListening();
    }
  }, [startListening]);

  // Decide the initial path once mounted (after reduced-motion resolves).
  useEffect(() => {
    if (reduce || !isTouchDevice() || !("DeviceOrientationEvent" in window)) {
      setStatus("unsupported");
      return;
    }
    if (needsPermission()) {
      // iOS: wait for the tap-to-enable affordance (requestPermission needs it).
      setStatus("prompt");
      return;
    }
    // Android & friends: start ambiently right away.
    detach.current = startListening();
    return () => {
      detach.current?.();
      detach.current = null;
    };
  }, [reduce, startListening]);

  const value = useMemo<DeviceTiltValue>(
    () => ({ status, enable, tiltX, tiltY }),
    [status, enable, tiltX, tiltY],
  );

  return (
    <DeviceTiltContext.Provider value={value}>
      {children}
    </DeviceTiltContext.Provider>
  );
}

export function useDeviceTilt(): DeviceTiltValue {
  const ctx = useContext(DeviceTiltContext);
  if (!ctx) throw new Error("useDeviceTilt must be used within DeviceTiltProvider");
  return ctx;
}
