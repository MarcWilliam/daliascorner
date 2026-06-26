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
import { CARD_GYRO, CARD_SCROLL } from "@/lib/motion";

/**
 * Shared ambient-tilt source for the character grid.
 *
 * Two shared MotionValues (-1…1) feed every CharacterCard, so the whole grid
 * leans together — and there's a single source of truth, not one per card. The
 * values bypass React render (MotionValues), so updates are cheap. They're fed
 * by whichever ambient input is available, and the cards stay agnostic to which:
 *  • `"gyro"`  — the device's physical tilt (one `deviceorientation` listener).
 *  • `"scroll"` — fallback when the gyroscope can't drive: scroll impulses lean
 *    the grid front/back, then decay to rest. Used on touch devices whenever the
 *    gyro isn't the active source (no sensor, or iOS awaiting/denied permission).
 *  • `"none"`  — desktop / reduced-motion: no ambient lean (the cards use mouse
 *    or touch-drag tilt on their own).
 *
 * Platform reality the gyro path wraps:
 *  • iOS gates the sensor behind `DeviceOrientationEvent.requestPermission()`,
 *    which MUST be called from a user gesture → fired on the first tap; until
 *    then (and if denied) the scroll fallback covers it.
 *  • Android Chrome (and the rest) expose it freely on a secure origin → we
 *    auto-start → status `"active"`.
 */

type TiltStatus = "unsupported" | "prompt" | "active" | "denied";
type TiltSource = "gyro" | "scroll" | "none";

interface DeviceTiltValue {
  /** Gyro-permission lifecycle (independent of which source is currently live). */
  status: TiltStatus;
  /** Which input is feeding the ambient tilt channel right now. */
  source: TiltSource;
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
  // Whether this is a touch device — gates the scroll fallback (set on mount).
  const [touch, setTouch] = useState(false);

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
    const touchCapable = isTouchDevice();
    setTouch(touchCapable);
    if (reduce || !touchCapable || !("DeviceOrientationEvent" in window)) {
      // No gyro path. On a touch device the scroll fallback still kicks in
      // (via `source` below); on desktop / reduced-motion nothing ambient runs.
      setStatus("unsupported");
      return;
    }
    if (needsPermission()) {
      // iOS gates the sensor behind requestPermission(), which only works from
      // inside a user gesture. Rather than a dedicated button, fire it on the
      // visitor's first tap anywhere — the "up"/"end" events reliably carry the
      // transient activation iOS requires. Granted once, iOS won't re-prompt;
      // denied once, we stop (re-prompting on every tap would just be noise).
      setStatus("prompt");
      const events = ["pointerup", "touchend", "click"];
      const cleanupGesture = () => {
        for (const evt of events) window.removeEventListener(evt, onFirstGesture);
      };
      const onFirstGesture = () => {
        cleanupGesture();
        enable();
      };
      for (const evt of events) {
        window.addEventListener(evt, onFirstGesture, { once: true });
      }
      return cleanupGesture;
    }
    // Android & friends: start ambiently right away.
    detach.current = startListening();
    return () => {
      detach.current?.();
      detach.current = null;
    };
  }, [reduce, startListening, enable]);

  // Which input owns the ambient channel: the gyro once active, otherwise scroll
  // on any touch device, and nothing on desktop / reduced-motion.
  const source: TiltSource = useMemo(() => {
    if (status === "active") return "gyro";
    if (touch && !reduce) return "scroll";
    return "none";
  }, [status, touch, reduce]);

  // Scroll fallback. Each scroll event injects an impulse (clamped scroll delta)
  // into the front/back channel; a rAF loop bleeds it back toward neutral so the
  // grid settles when the page stops. Only runs while scroll is the live source.
  useEffect(() => {
    if (source !== "scroll") return;
    let last = window.scrollY;
    let impulse = 0;
    let raf = 0;
    const tick = () => {
      impulse *= CARD_SCROLL.decay;
      tiltY.set(impulse);
      if (Math.abs(impulse) > 0.003) {
        raf = requestAnimationFrame(tick);
      } else {
        tiltY.set(0);
        raf = 0;
      }
    };
    const onScroll = () => {
      const y = window.scrollY;
      const dv = y - last;
      last = y;
      impulse = Math.max(-1, Math.min(1, dv / CARD_SCROLL.deltaFull));
      tiltY.set(impulse);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      tiltX.set(0);
      tiltY.set(0);
    };
  }, [source, tiltX, tiltY]);

  const value = useMemo<DeviceTiltValue>(
    () => ({ status, source, enable, tiltX, tiltY }),
    [status, source, enable, tiltX, tiltY],
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
