"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function JoinChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="vx vx-join-pop" role="dialog" aria-modal="true" aria-label="Join the Game">
      <button type="button" className="vx-join-pop-backdrop" aria-label="Close" onClick={onClose} />
      <div className="vx-join-pop-card">
        <p className="vx-eyebrow" style={{ margin: 0 }}>Join the Game</p>
        <a href="/login/freshie" className="vx-btn vx-btn-ghost">
          Freshie Login
        </a>
        <a href="/login" className="vx-btn vx-btn-ghost">
          Committee FACI GM login
        </a>
      </div>
    </div>,
    document.body
  );
}
