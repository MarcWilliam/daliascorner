import type { Config } from "tailwindcss";

/**
 * Dalia's Corner — Tailwind theme.
 * Every colour here points at a CSS variable defined in app/globals.css (:root).
 * Rule from the design system: never write a raw hex in markup — use these tokens.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "400px",
      },
      colors: {
        // Channel-based tokens (vars hold "R G B") so opacity modifiers work:
        // `bg-ink/55`, `ring-brand/45`, etc. resolve to rgb(var(--x) / <alpha>).
        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-deep": "rgb(var(--brand-deep) / <alpha-value>)",
        "brand-edge": "rgb(var(--brand-edge) / <alpha-value>)",
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        "canvas-sunk": "rgb(var(--canvas-sunk) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        clay: "rgb(var(--clay) / <alpha-value>)",
        "clay-deep": "rgb(var(--clay-deep) / <alpha-value>)",
        "clay-edge": "rgb(var(--clay-edge) / <alpha-value>)",
        "clay-soft": "rgb(var(--clay-soft) / <alpha-value>)",
        orange: "rgb(var(--orange) / <alpha-value>)",
        "orange-edge": "rgb(var(--orange-edge) / <alpha-value>)",
        mauve: "rgb(var(--mauve) / <alpha-value>)",
        "mauve-soft": "rgb(var(--mauve-soft) / <alpha-value>)",
        leaf: "rgb(var(--leaf) / <alpha-value>)",
        "leaf-soft": "rgb(var(--leaf-soft) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
      },
      fontFamily: {
        // Baloo 2 carries Latin; Arabic glyphs fall through to Baloo Bhaijaan 2.
        display: ["var(--font-display)"],
        // Cairo covers both Latin and Arabic in one face.
        body: ["var(--font-body)"],
      },
      borderRadius: {
        clay: "1.5rem", // 24px — claymorphism range 16–24px
        "clay-lg": "2rem", // 32px cards
        blob: "42% 58% 56% 44% / 50% 44% 56% 50%",
      },
      boxShadow: {
        // Clay-tinted (warm green) shadows, never pure black.
        clay: "8px 10px 24px rgba(58,90,64,0.16), -5px -5px 16px rgba(255,255,255,0.65)",
        "clay-sm":
          "4px 5px 14px rgba(58,90,64,0.13), -3px -3px 10px rgba(255,255,255,0.6)",
        "clay-lg":
          "12px 16px 36px rgba(58,90,64,0.18), -6px -6px 20px rgba(255,255,255,0.7)",
        "clay-inset":
          "inset 4px 5px 12px rgba(58,90,64,0.16), inset -3px -3px 9px rgba(255,255,255,0.55)",
        "clay-focus": "0 0 0 4px rgb(var(--canvas)), 0 0 0 7px rgb(var(--brand))",
        // Soft, warm, diffuse "lifted photo" elevation (terracotta-tinted, no white
        // highlight) — a real drop shadow rather than the puffy clay look.
        photo:
          "0 8px 20px -6px rgba(156,90,52,0.20), 0 18px 40px -14px rgba(156,90,52,0.18)",
        "photo-lg":
          "0 16px 32px -8px rgba(156,90,52,0.24), 0 34px 64px -16px rgba(156,90,52,0.24)",
      },
      transitionTimingFunction: {
        clay: "cubic-bezier(0.34, 1.56, 0.64, 1)", // gentle springy press
      },
      keyframes: {
        // Leaf swaying on its stem — gentle pendulum with a touch of lift.
        "leaf-sway": {
          "0%, 100%": { transform: "translateY(0) rotate(-13deg)" },
          "50%": { transform: "translateY(-4px) rotate(13deg)" },
        },
        // Continuous slow wander — multi-directional so it never reads as static.
        "blob-drift": {
          "0%, 100%": { transform: "translate3d(0px, 0px, 0) rotate(0deg)" },
          "25%": { transform: "translate3d(26px, -20px, 0) rotate(7deg)" },
          "50%": { transform: "translate3d(-10px, -32px, 0) rotate(-5deg)" },
          "75%": { transform: "translate3d(-26px, -14px, 0) rotate(5deg)" },
        },
        // Seamless marquee: the track holds two identical copies, so shifting by
        // exactly half its width loops with no visible seam.
        marquee: {
          from: { transform: "translate3d(0,0,0)" },
          to: { transform: "translate3d(-50%,0,0)" },
        },
      },
      animation: {
        "blob-drift": "blob-drift 9s ease-in-out infinite",
        "leaf-sway": "leaf-sway 6s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
