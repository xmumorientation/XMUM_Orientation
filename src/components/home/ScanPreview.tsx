"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { createPortal } from "react-dom";

// ─── DEV PREVIEW: QR scanner on the public homepage ─────────────────────────
// The raised Scan button in the homepage's mobile tab bar (SiteNav.tsx,
// TabBar) and the Scan button in the desktop nav open the scanner UI directly
// on the homepage, so the UI/UX can be reviewed on a phone without logging
// in. It is UI only: no backend, nothing is claimed (QrScannerScreen runs
// with `preview`).
//
// Before production deploy, set SHOW_SCAN_PREVIEW = false (hides both buttons
// and this overlay) or gate it behind login. The real entry is the
// Freshie-only /scan page in the logged-in app (floating Scan button in
// components/AppShell.tsx).
//
// Phone-testing notes (HTTPS tunnel, NEXT_PUBLIC_SITE_URL) are at the top of
// components/scan/QrScannerScreen.tsx.
export const SHOW_SCAN_PREVIEW = true;

// Loaded only when opened, so the homepage bundle stays light.
const QrScannerScreen = dynamic(
  () => import("@/components/scan/QrScannerScreen").then((m) => m.QrScannerScreen),
  { ssr: false }
);

export function ScanPreview({ onClose }: { onClose: () => void }) {
  // Lock page scroll and allow Escape to close while the scanner is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portal to <body>: the section's transform animations would otherwise trap
  // the fixed-position scanner inside the section.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="QR scanner preview" style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <QrScannerScreen onClose={onClose} preview />
    </div>,
    document.body
  );
}
// ─── end DEV PREVIEW ────────────────────────────────────────────────────────
