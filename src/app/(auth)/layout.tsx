export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mb-2 text-4xl">✦</div>
        <h1 className="text-2xl font-bold tracking-tight">
          Starlight Revival
        </h1>
        <p className="text-sm text-ink-faint">XMUM Orientation 2026</p>
        <div className="starlight-rule mx-auto mt-3 w-24" />
      </div>
      {children}
    </main>
  );
}
