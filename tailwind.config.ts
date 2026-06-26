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
        brand: "var(--brand)",
        "brand-deep": "var(--brand-deep)",
        "brand-edge": "var(--brand-edge)",
        canvas: "var(--canvas)",
        "canvas-sunk": "var(--canvas-sunk)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        clay: "var(--clay)",
        "clay-deep": "var(--clay-deep)",
        "clay-edge": "var(--clay-edge)",
        "clay-soft": "var(--clay-soft)",
        orange: "var(--orange)",
        "orange-edge": "var(--orange-edge)",
        mauve: "var(--mauve)",
        "mauve-soft": "var(--mauve-soft)",
        leaf: "var(--leaf)",
        "leaf-soft": "var(--leaf-soft)",
        line: "var(--line)",
        destructive: "var(--destructive)",
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
        "clay-focus": "0 0 0 4px var(--canvas), 0 0 0 7px var(--brand)",
      },
      transitionTimingFunction: {
        clay: "cubic-bezier(0.34, 1.56, 0.64, 1)", // gentle springy press
      },
      keyframes: {
        "blob-drift": {
          "0%, 100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(0,-14px,0) rotate(6deg)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "blob-drift": "blob-drift 9s ease-in-out infinite",
        "rise-in": "rise-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
