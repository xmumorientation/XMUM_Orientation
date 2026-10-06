"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { FONT } from "./data";
import { nexusBody, vxDisplay, vxSlab } from "./fonts";

/**
 * Login chooser opened by every "Join the Game" button. It is portalled to
 * <body>, outside the page wrapper, so it sets the font variables itself.
 */
export function JoinChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    // Lock page scroll behind the dialog and return focus when it closes.
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    firstRef.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`vx vx-join-pop ${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}
      style={{ fontFamily: FONT.body }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vx-join-title"
      aria-describedby="vx-join-note"
    >
      <button type="button" className="vx-join-pop-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="vx-join-pop-card">
        <div className="vx-join-pop-head">
          <h2 id="vx-join-title" className="vx-eyebrow">
            Join the Game
          </h2>
          <button type="button" className="vx-join-pop-close" aria-label="Close" onClick={onClose}>
            <X size={22} aria-hidden />
          </button>
        </div>
        <p id="vx-join-note" className="vx-join-pop-note">
          Freshies log in with their group. Committee, Faci and GM use their own login.
        </p>
        <a ref={firstRef} href="/login/freshie" className="vx-btn vx-btn-primary">
          Freshie Login
        </a>
        <a href="/login" className="vx-btn vx-btn-ghost">
          Committee, Faci, GM login
        </a>
      </div>
    </div>,
    document.body
  );
}
