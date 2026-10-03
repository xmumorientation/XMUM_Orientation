"use client";

import Link from "next/link";

import { useProfile } from "@/components/ProfileProvider";
import { QrScannerScreen } from "@/components/scan/QrScannerScreen";

// Logged-in scanner (Freshie only) — the intended production entry point,
// reached from the floating Scan button in AppShell. UI lives in
// components/scan/QrScannerScreen.tsx.
export default function ScanPage() {
  const profile = useProfile();

  if (profile.role !== "freshie") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#07060b] px-8 text-center text-white">
        <h1 className="text-2xl font-black">Scanner is for Freshies</h1>
        <p className="text-sm text-white/70">Blind box QR codes can only be scanned by Freshie accounts.</p>
        <Link href="/dashboard" className="mt-4 flex min-h-[48px] items-center rounded-full bg-[#F2FF0B] px-8 text-sm font-bold text-black">
          Back to home
        </Link>
      </div>
    );
  }

  return <QrScannerScreen closeHref="/dashboard" />;
}
