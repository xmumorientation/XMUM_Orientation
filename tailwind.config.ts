import type { Config } from "tailwindcss";

/**
 * Design tokens: neutral "control room" base (paper/ink/status/night) with a
 * single swappable identity slot — brand-1/brand-2, set at runtime from
 * Admin → Brand — so a yearly theme change never requires touching these
 * tokens. Dark theatrical styling stays reserved for hero moments (gacha,
 * NFC activation, bigscreen).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "#fdfcfa",
          100: "#f8f6f2",
          200: "#efece5",
          300: "#e2ded4",
        },
        ink: {
          DEFAULT: "#1c1a17",
          soft: "#4a463f",
          faint: "#6f695f",
          muted: "#746f66",
        },
        // The one swappable accent — reads var(--brand-1-rgb)/var(--brand-2-rgb)
        // channel triples so opacity modifiers (bg-brand-1/20) work correctly.
        brand: {
          1: "rgb(var(--brand-1-rgb) / <alpha-value>)",
          2: "rgb(var(--brand-2-rgb) / <alpha-value>)",
        },
        status: {
          open: "#16a34a",
          busy: "#dc2626",
          closed: "#9ca3af",
        },
        night: {
          900: "#0a0a14",
          800: "#121222",
          700: "#1c1c38",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "0.625rem",
        md: "0.875rem",
        lg: "1.125rem",
        xl: "1.5rem",
        "2xl": "1.75rem",
      },
      boxShadow: {
        flat: "none",
        raised: "0 1px 2px rgba(28,26,23,0.05), 0 2px 8px rgba(28,26,23,0.06)",
        floating: "0 8px 24px rgba(28,26,23,0.10), 0 2px 6px rgba(28,26,23,0.06)",
        overlay: "0 24px 90px rgba(28,26,23,0.18)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "240ms",
      },
      transitionTimingFunction: {
        snappy: "cubic-bezier(0.32,0.72,0,1)",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-6deg)" },
          "40%": { transform: "rotate(6deg)" },
          "60%": { transform: "rotate(-4deg)" },
          "80%": { transform: "rotate(4deg)" },
        },
        burst: {
          "0%": { transform: "scale(0.2)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        circuit: {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        pulseglow: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        floatup: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        stampImpact: {
          "0%": { transform: "scale(0.4) rotate(-14deg)", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(3deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
      },
      animation: {
        shake: "shake 0.5s ease-in-out 3",
        burst: "burst 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        circuit: "circuit 2.4s ease-in-out forwards",
        pulseglow: "pulseglow 1.6s ease-in-out infinite",
        floatup: "floatup 0.35s ease-out forwards",
        "stamp-impact": "stampImpact 280ms cubic-bezier(0.32,0.72,0,1) forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
