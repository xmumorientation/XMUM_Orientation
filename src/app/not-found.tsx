import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-1/20 text-sm font-black tracking-tight text-brand-1">
          VX
        </span>
        <h1 className="mt-3 text-xl font-bold text-ink">Page not found</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-5 text-ink-faint">
          This ride doesn&apos;t exist. Check the link, or head back to your
          dashboard.
        </p>
        <div className="mt-5">
          <Link href="/dashboard" className="btn-primary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
