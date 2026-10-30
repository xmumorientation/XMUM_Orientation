"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

const FOLD_MS = 300;

/**
 * A folding card's body that opens and closes with a height animation
 * (.gc-fold-wrap: grid rows 0fr to 1fr). On open it mounts closed, the closed
 * state is flushed (a layout read), and only then does it get data-open, so the
 * browser always has a start to animate from. It stays mounted while it closes;
 * closed, it is inert. With reduced motion it opens and closes at once.
 */
export function FoldBody({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const ref = useRef<HTMLDivElement>(null);
  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      void el.offsetHeight;
      el.dataset.open = "";
      return;
    }
    delete el.dataset.open;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMounted(false), still ? 0 : FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <div ref={ref} className="gc-fold-wrap" inert={!open}>
      <div className="gc-fold-inner">{children}</div>
    </div>
  );
}

/**
 * Bottom sheet in the Game control colours (rendered in a portal, so it
 * carries its own). `wide`: most of the screen, centred from 1024px, for a table.
 */
export function Sheet({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        layout="sheetBottom"
        title={title}
        className={cn("gc-sheet", wide && "gc-sheet-wide", vxDisplay.variable, vxSlab.variable)}
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
            <span>Type {typeToConfirm} to Confirm</span>
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
