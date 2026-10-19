"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

// Small pieces shared by the Game control sections (HOGM's Ops page).

/** One error or success line per section. Success clears itself. */
export function useStatus() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback((m: string) => {
    setError(null);
    setNotice(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { error, setError, notice, flash };
}

export function StatusLine({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p className="gc-status gc-status-err" role="alert">{error}</p>;
  if (notice) return <p className="gc-status gc-status-ok" role="status">{notice}</p>;
  return null;
}

/** Bottom sheet in the Game control colours (rendered in a portal, so it carries its own). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        layout="sheetBottom"
        title={title}
        className={cn("gc-sheet", vxDisplay.variable, vxSlab.variable)}
        overlayClassName="gc-scrim"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks before a change that is hard to undo. With `typeToConfirm`, the button
 * stays off until that word is typed.
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger = false,
  typeToConfirm,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="gc-form">
        <div className="gc-sheet-body">{body}</div>
        {typeToConfirm && (
          <label className="gc-field">
            <span>Type {typeToConfirm} to confirm</span>
            <input
              className="gc-input gc-input-danger"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        )}
        <div className="gc-row2">
          <button type="button" className="gc-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cn("gc-btn", danger ? "gc-btn-stop" : "gc-btn-go")}
            disabled={!ready || busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
