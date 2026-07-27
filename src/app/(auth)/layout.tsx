"use client";

import { Monogram } from "@/components/ui/Monogram";
import { useConfig } from "@/components/useConfig";
import { hexToRgbChannels } from "@/lib/utils";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { brand } = useConfig();
  const tagline = brand.eventTagline || "Your event, unlocked.";

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
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="mb-7 inline-flex rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-ink-soft shadow-[0_18px_60px_rgba(28,26,23,0.08)]">
            XMUM Orientation 2026
          </div>
          <h1 className="font-display text-[clamp(4.5rem,9vw,8rem)] font-bold leading-[0.86] tracking-[-0.03em] text-ink">
            {brand.eventName}
          </h1>
          <p className="mt-6 max-w-xl text-2xl font-semibold leading-8 tracking-tight text-ink-soft">
            {tagline}
          </p>
          <div className="mt-8 h-1.5 w-40 rounded-full bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2))]" />
          <div className="mt-14 grid max-w-lg grid-cols-[1fr_auto] items-end gap-5 border-t border-ink/10 pt-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-faint">
              Student portal
            </p>
            <p className="text-right text-sm font-bold text-ink-soft">
              July 2026
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-4 flex items-center justify-between sm:mb-5 lg:hidden">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-1">
                XMUM Orientation 2026
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em]">
                {brand.eventName}
              </h1>
              <p className="mt-1 max-w-[16rem] text-sm font-semibold leading-5 text-ink-faint">
                {tagline}
              </p>
            </div>
            <Monogram name={brand.eventName} />
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
