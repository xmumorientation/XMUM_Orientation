"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBanner, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

// FR-1.2: Freshie self-registration with student email + password.
// Staff accounts are NOT created here — they are CSV-imported by Admin.
export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // FR-1.2: validate against the XMUM student email pattern
    if (!/^[a-zA-Z0-9._%+-]+@xmu\.edu\.my$/i.test(email)) {
      setError("Please use your XMUM student email (…@xmu.edu.my).");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, student_id: studentId, phone },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      // Email confirmation enabled on the Supabase project
      setNotice("Check your inbox to confirm your email, then log in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-card">
      <div className="auth-card-inner space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-star-cyanstrong">
            Freshie registration
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-ink">
            Create your event pass.
          </h2>
        </div>
        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />
        <div>
          <label className="label" htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            required
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="studentId">
            Student ID
          </label>
          <input
            id="studentId"
            required
            className="input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            required
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            XMUM student email
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="abc12345@xmu.edu.my"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password (min 8 chars)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy} className="group auth-submit">
          {busy ? (
            <Spinner className="border-white/40 border-t-white" />
          ) : (
            "Create account"
          )}
        </button>
        <p className="text-center text-sm text-ink-faint">
          Already registered?{" "}
          <Link href="/login" className="font-bold text-star-cyanstrong">
            Log in
          </Link>
        </p>
      </div>
    </form>
  );
}
