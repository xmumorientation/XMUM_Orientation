import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="auth-card">
      <div className="auth-card-inner space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-1">Freshie registration</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-ink">Register at the orientation counter.</h2>
          <p className="mt-3 text-sm leading-6 text-ink-faint">
            Freshies do not need website login accounts. The registration team will add you to the Freshie roster and assign your group at the registration counter.
          </p>
        </div>
        <Link href="/login" className="auth-submit flex items-center justify-center">Staff login</Link>
      </div>
    </div>
  );
}
