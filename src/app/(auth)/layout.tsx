export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_16%,rgba(8,145,178,0.20),transparent_30rem),radial-gradient(circle_at_82%_12%,rgba(217,154,6,0.18),transparent_26rem),linear-gradient(135deg,#f7f7f5,#eef4f3_48%,#f8f6f0)]" />
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="hidden lg:block">
          <div className="mb-8 inline-flex rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-ink-soft shadow-[0_18px_60px_rgba(28,26,23,0.08)]">
            XMUM Orientation 2026
          </div>
          <h1 className="max-w-[9ch] text-[clamp(4.5rem,8vw,7.5rem)] font-black leading-[0.86] tracking-[-0.04em] text-ink">
            Starlight Revival
          </h1>
          <p className="mt-8 max-w-xl text-xl font-medium leading-8 text-ink-soft">
            One command surface for registration, attendance, game economy,
            station control, and endgame activation.
          </p>
          <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
            {[
              ["REG", "Freshie access"],
              ["OPS", "Live control"],
              ["GAME", "Token economy"],
            ].map(([code, label]) => (
              <div
                key={code}
                className="rounded-[1.5rem] border border-white/80 bg-white/70 p-1.5 shadow-[0_24px_80px_rgba(28,26,23,0.10)]"
              >
                <div className="rounded-[calc(1.5rem-0.375rem)] border border-base-200 bg-white px-4 py-5">
                  <p className="text-xs font-black tracking-[0.24em] text-star-cyanstrong">
                    {code}
                  </p>
                  <p className="mt-3 text-sm font-bold text-ink">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center justify-between lg:hidden">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-star-cyanstrong">
                XMUM Orientation 2026
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.03em]">
                Starlight Revival
              </h1>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white">
              SR
            </span>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
