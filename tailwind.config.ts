import type { Config } from "tailwindcss";

/**
 * "Soft Starlight" design tokens (proposal §7):
 * light, warm base + starlight accents (gold-amber, aqua-cyan, soft violet).
 * Dark theatrical styles are reserved for hero moments (gacha, activation).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
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
        star: {
          gold: "#d99a06",
          goldsoft: "#f5c542",
          cyan: "#0891b2",
          cyanstrong: "#0f7188",
          cyansoft: "#67e8f9",
          violet: "#7c3aed",
          violetsoft: "#c4b5fd",
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
        sans: [
          "Plus Jakarta Sans",
          "Geist",
          "Avenir Next",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(28,26,23,0.06), 0 4px 16px rgba(28,26,23,0.06)",
        glow: "0 0 24px rgba(245,197,66,0.45)",
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
      },
      animation: {
        shake: "shake 0.5s ease-in-out 3",
        burst: "burst 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        circuit: "circuit 2.4s ease-in-out forwards",
        pulseglow: "pulseglow 1.6s ease-in-out infinite",
        floatup: "floatup 0.35s ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
