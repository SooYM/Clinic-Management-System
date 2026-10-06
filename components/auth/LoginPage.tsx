"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "../../lib/state/session";

interface Props {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: Props) {
  const { signIn } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fe: { username?: string; password?: string } = {};
    if (!username.trim()) fe.username = "Enter your username or clinic email.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (fe.username || fe.password) return;

    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-stretch bg-[var(--bg)]">
      {/* 1. Left sidebar: clinic system information */}
      <aside className="hidden w-[45%] max-w-[560px] flex-col justify-between bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#0f172a] px-10 py-12 text-white lg:flex shadow-2xl relative overflow-hidden">
        {/* Soft pastel ambient glow circles */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-sky-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-sky-400 to-teal-300 flex items-center justify-center text-white font-extrabold text-xl shadow-lg ring-1 ring-white/20">
              C
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
                Clinical Management System
              </p>
              <p className="text-[0.65rem] text-white/70">Medical & Healthcare Suite</p>
            </div>
          </div>

          <h1
            className="text-3xl font-extrabold leading-tight text-white tracking-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            Clinical operating system for outpatient medical & healthcare
          </h1>
          <p className="mt-3 text-sm text-sky-100/80 leading-relaxed">
            Unified platform for front-desk queue management, digital medical certificates, master formulary, and FEFO dispensary stock.
          </p>
        </div>

        {/* Feature Highlights */}
        <ul className="space-y-6 text-sm text-white/90 relative z-10 my-8">
          <li className="flex gap-3.5 items-start">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30 text-base font-bold">
              ✓
            </span>
            <div>
              <strong className="block text-white font-semibold">Queue & Room Dispatch</strong>
              <span className="text-xs text-white/75 mt-0.5 block leading-normal">
                Clinic queue workspace. Live sync and doctor room assignments with instant ticket dispatch.
              </span>
            </div>
          </li>

          <li className="flex gap-3.5 items-start">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30 text-base font-bold">
              ✓
            </span>
            <div>
              <strong className="block text-white font-semibold">Clinical Documents</strong>
              <span className="text-xs text-white/75 mt-0.5 block leading-normal">
                Medical certificates, referral letters, and lab requisitions with print and reissue previews.
              </span>
            </div>
          </li>

          <li className="flex gap-3.5 items-start">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30 text-base font-bold">
              ✓
            </span>
            <div>
              <strong className="block text-white font-semibold">Master Formulary & FEFO Inventory</strong>
              <span className="text-xs text-white/75 mt-0.5 block leading-normal">
                Complete clinic drug catalog, First-Expiry-First-Out batch tracking, and point-of-sale checkout.
              </span>
            </div>
          </li>
        </ul>

        {/* Security / Compliance Footer */}
        <div className="flex items-center justify-between text-xs text-white/70 pt-6 border-t border-white/10 relative z-10">
          <p>Malaysia clinic workflow · Configure access controls and audit retention before using real patient data.</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 px-2.5 py-0.5 text-[0.65rem] font-bold text-emerald-300 ring-1 ring-emerald-400/40">
            ● Malaysia clinic workflow
          </span>
        </div>
      </aside>

      {/* 2. Main Login Form Area */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[430px]">
          {/* Mobile Logo for small screens */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-sky-400 to-teal-400 flex items-center justify-center text-white font-extrabold text-lg shadow-md">
              C
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                Clinical Management System
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">
              Sign in
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              ● Staff sign-in
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Use the credentials provided by your clinic administrator.
          </p>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="clinic-card mt-5 space-y-4 p-6 border border-[var(--line)] shadow-xl"
            noValidate
          >
            {error && (
              <div className="p-3 bg-[var(--danger-soft)] text-[var(--danger)] text-xs rounded-lg font-bold border border-[var(--danger)]/30 flex items-start gap-2">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Username or Email
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                placeholder="admin, doctor, reception, nurse"
                className={`w-full text-xs p-2.5 rounded-lg border ${
                  fieldErrors.username ? "border-[var(--danger)]" : "border-[var(--line)]"
                } bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium`}
              />
              {fieldErrors.username && (
                <span className="text-[0.68rem] text-[var(--danger)] mt-1 block font-medium">
                  {fieldErrors.username}
                </span>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full text-xs p-2.5 rounded-lg border ${
                  fieldErrors.password ? "border-[var(--danger)]" : "border-[var(--line)]"
                } bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium`}
              />
              {fieldErrors.password && (
                <span className="text-[0.68rem] text-[var(--danger)] mt-1 block font-medium">
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full text-xs py-2.5 mt-2 justify-center"
            >
              {busy ? "Signing in..." : "Sign in to Clinic Suite"}
            </button>
          </form>

          <p className="mt-6 text-[0.7rem] text-[var(--muted)] text-center leading-relaxed">
            Use a clinic-managed account. Configure and review your clinic&apos;s privacy, access, and retention policies before adding real patient records.
          </p>
        </div>
      </div>
    </div>
  );
}
