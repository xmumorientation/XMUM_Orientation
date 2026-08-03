"use client";

import { useConfig } from "@/components/useConfig";
import { hexToRgbChannels } from "@/lib/utils";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { brand } = useConfig();

  return (
    <main
      className="relative min-h-dvh overflow-hidden px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 lg:px-8"
      style={
        {
          "--brand-1": brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
          "--brand-1-rgb": hexToRgbChannels(brand.brandPrimary),
          "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_14%,rgb(var(--brand-1-rgb)/0.18),transparent_28rem),radial-gradient(circle_at_84%_16%,rgb(var(--brand-2-rgb)/0.14),transparent_28rem),linear-gradient(135deg,#fdfcfa,#f5f8f7_52%,#f8f6f0)]" />

      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden lg:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-paper-300 bg-white/80 px-4 py-1.5 text-xs font-bold text-ink-soft shadow-raised">
            <span className="h-2 w-2 rounded-full bg-brand-1" />
            <span>XMUM Freshies Orientation</span>
          </div>

          <h1 className="font-display text-[clamp(3.5rem,6vw,5.5rem)] font-black leading-[0.95] tracking-[-0.03em] text-ink">
            Welcome to XMUM!
          </h1>
          <p className="mt-4 max-w-md text-xl font-bold leading-8 tracking-tight text-ink-soft">
            Your XMUM journey starts here.
          </p>

          <div className="mt-6 h-1.5 w-32 rounded-full bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2))]" />

          <div className="mt-10 max-w-lg border-t border-paper-200 pt-4 text-xs font-semibold text-ink-faint">
            Xiamen University Malaysia • Official Orientation Platform
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-1">
                XMUM Freshies Orientation
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-ink">
              Welcome to XMUM
            </h1>
            <p className="mt-1 text-sm font-semibold leading-5 text-ink-faint">
              Your XMUM journey starts here.
            </p>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
