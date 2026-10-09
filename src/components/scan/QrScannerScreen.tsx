"use client";

import { Camera, Check, Copy, Flashlight, Globe, ImageUp, RotateCcw, ScanLine, VideoOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";

// Full-screen web QR scanner UI. Opens the rear camera, decodes a QR code
// with `qr-scanner`, and shows the result. Photo upload is the fallback when
// the camera is blocked or unavailable.
//
// Used in two places:
//   - /scan (logged-in app, Freshie only) — the intended production entry.
//   - Homepage Welcome section, as a DEV-ONLY UI/UX preview (`preview` prop).
//     See the DEV PREVIEW note in components/home/sections/WelcomeSection.tsx.
//
// A detected blind-box QR sends the Freshie to its /blindbox?t=<token> link.
// That page shows the confirm screen; nothing is paid and no box is deducted
// until the Freshie taps Open there. In `preview` mode (homepage) it only
// classifies and shows the result.
//
// Testing on a phone (development only — not needed once deployed on HTTPS):
//   - Camera access requires HTTPS. `http://<LAN-IP>:3000` will not work.
//     Run `npm run dev`, then `cloudflared tunnel --url http://localhost:3000`
//     and open the printed https://*.trycloudflare.com URL on the phone.
//   - Set NEXT_PUBLIC_SITE_URL in .env.local to that tunnel URL and restart
//     the dev server, otherwise blind-box QRs (minted with that base URL) will
//     not match window.location.origin and show "Not a Vortexa blind box".
//     Revert NEXT_PUBLIC_SITE_URL afterwards; production uses the real domain.

type Phase =
  | "starting"
  | "scanning"
  | "detected"
  | "denied"
  | "no-camera"
  | "in-app";

type Detected = { raw: string; kind: "blindbox" | "other" };

// Social apps' built-in browsers often cannot open the camera.
const IN_APP_UA = /MicroMessenger|Instagram|FBAN|FBAV|XHSDiscover|xiaohongshu|Line\/|musical_ly|BytedanceWebview|TikTok/i;

/** Blind-box QRs encode `<our site>/blindbox?t=<token>` (see lib/blindbox.ts).
 *  Returns the in-app path to open, or null for anything else (including links
 *  to another site, which must never be followed). */
function blindBoxPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin === window.location.origin && url.pathname === "/blindbox" && url.searchParams.get("t")) {
      return url.pathname + url.search;
    }
  } catch {
    // Not a URL.
  }
  return null;
}

function classify(raw: string): Detected["kind"] {
  return blindBoxPath(raw) ? "blindbox" : "other";
}

type Props = {
  /** Close handler (overlay usage). When absent, close links to `closeHref`. */
  onClose?: () => void;
  closeHref?: string;
  /** DEV preview mode: UI only, copy says so. */
  preview?: boolean;
};

export function QrScannerScreen({ onClose, closeHref = "/dashboard", preview = false }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const libRef = useRef<typeof QrScannerType | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [skipInApp, setSkipInApp] = useState(false);

  const handleResult = useCallback((raw: string) => {
    scannerRef.current?.stop();
    setFlashOn(false);
    navigator.vibrate?.(60);
    setDetected({ raw, kind: classify(raw) });
    setPhase("detected");
    const path = blindBoxPath(raw);
    if (path && !preview) router.push(path);
  }, [preview, router]);

  const loadLib = useCallback(async () => {
    if (!libRef.current) libRef.current = (await import("qr-scanner")).default;
    return libRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    setUploadError(null);
    setDetected(null);
    setPhase("starting");
    try {
      const QrScanner = await loadLib();
      if (!(await QrScanner.hasCamera())) {
        setPhase("no-camera");
        return;
      }
      if (!videoRef.current) return;
      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(videoRef.current, (r) => handleResult(r.data), {
          preferredCamera: "environment",
          maxScansPerSecond: 8,
          returnDetailedScanResult: true,
        });
      }
      await scannerRef.current.start();
      setHasFlash(await scannerRef.current.hasFlash().catch(() => false));
      setPhase("scanning");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : String(err);
      setPhase(/NotAllowed|Permission|denied/i.test(name) ? "denied" : "no-camera");
    }
  }, [handleResult, loadLib]);

  useEffect(() => {
    if (!skipInApp && IN_APP_UA.test(navigator.userAgent)) {
      setPhase("in-app");
      return;
    }
    startCamera();
    return () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [skipInApp, startCamera]);

  async function toggleFlash() {
    if (!scannerRef.current) return;
    await scannerRef.current.toggleFlash().catch(() => {});
    setFlashOn(scannerRef.current.isFlashOn());
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      const QrScanner = await loadLib();
      const r = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      handleResult(r.data);
    } catch {
      setUploadError("No QR code found in that photo. Try again closer and with more light.");
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const uploadButton = (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
    >
      <ImageUp size={18} /> Upload a photo instead
    </button>
  );

  const closeClass = "flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25";
  const backClass = "flex min-h-[48px] items-center justify-center rounded-full border border-white/25 text-sm font-bold";

  const showCamera = phase === "starting" || phase === "scanning" || phase === "detected";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col text-white"
      style={{ background: "color-mix(in srgb, var(--fh-accent, #008CFF) 22%, #07060b)" }}
    >
      <style>{"@keyframes scanline{from{top:8%}to{top:88%}}"}</style>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {/* Camera layer stays mounted so the scanner can reuse the <video>. */}
      <div className={showCamera ? "absolute inset-0" : "hidden"}>
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black/55"
          style={{
            clipPath:
              "polygon(0 0,100% 0,100% 100%,0 100%,0 24%,15% 24%,15% calc(24% + min(70vw,340px)),85% calc(24% + min(70vw,340px)),85% 24%,0 24%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[15%] right-[15%] top-[24%] mx-auto"
          style={{ height: "min(70vw, 340px)" }}
        >
          {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"].map((c) => (
            <span
              key={c}
              className={`absolute h-10 w-10 ${c}`}
              style={{ borderColor: "var(--fh-accent, #008CFF)", filter: "drop-shadow(0 0 8px var(--fh-accent, #008CFF))" }}
            />
          ))}
          {phase === "scanning" && (
            <span
              className="absolute inset-x-[6%] top-1/2 h-[3px] rounded-full motion-safe:animate-[scanline_2.2s_ease-in-out_infinite_alternate]"
              style={{ background: "var(--fh-accent, #008CFF)", boxShadow: "0 0 16px 4px var(--fh-accent, #008CFF)" }}
            />
          )}
        </div>
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close scanner" className={closeClass}>
            <X size={22} />
          </button>
        ) : (
          <Link href={closeHref} aria-label="Close scanner" className={closeClass}>
            <X size={22} />
          </Link>
        )}
        <span className="flex items-center gap-2 text-base font-bold tracking-wide">
          Scan
          {preview && <span className="rounded-full bg-[#FE06AB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Preview</span>}
        </span>
        {phase === "scanning" && hasFlash ? (
          <button
            type="button"
            onClick={toggleFlash}
            aria-label={flashOn ? "Turn torch off" : "Turn torch on"}
            aria-pressed={flashOn}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition ${flashOn ? "bg-[#F2FF0B] text-black" : "bg-white/15 hover:bg-white/25"}`}
          >
            <Flashlight size={20} />
          </button>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      {/* Scanning: hint + upload fallback */}
      {(phase === "scanning" || phase === "starting") && (
        <>
          <div className="absolute inset-x-0 z-10 px-8 text-center" style={{ top: "calc(24% + min(70vw, 340px) + 1.5rem)" }}>
            <p className="text-lg font-bold">{phase === "starting" ? "Starting camera…" : "Fit the QR code inside the frame"}</p>
            <p className="mt-1 text-sm text-white/70">Hold your phone steady. Scanning is automatic.</p>
          </div>
          <div className="relative z-10 mt-auto space-y-2 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {uploadError && <p className="text-center text-sm text-[#FC9E3D]">{uploadError}</p>}
            {uploadButton}
          </div>
        </>
      )}

      {/* Detected */}
      {phase === "detected" && detected && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07060b]/85 px-8 text-center backdrop-blur-sm" role="status">
          <span
            className={`flex h-24 w-24 items-center justify-center rounded-full ${detected.kind === "blindbox" ? "bg-[#0DFCFD] shadow-[0_0_40px_rgba(13,252,253,0.45)]" : "bg-[#FC9E3D]"}`}
          >
            {detected.kind === "blindbox" ? <Check size={48} strokeWidth={3} className="text-[#06121a]" /> : <ScanLine size={40} className="text-black" />}
          </span>
          <h1 className="mt-2 text-2xl font-black">
            {detected.kind === "blindbox" ? "Blind box QR detected!" : "Not a Vortexa blind box"}
          </h1>
          <p className="max-w-xs text-sm text-white/70">
            {preview
              ? "Preview only — scanning works, but nothing is claimed yet."
              : detected.kind === "blindbox"
              ? "Opening your blind box…"
              : "This QR code isn't from a committee member. Look for a Vortexa blind box QR."}
          </p>
          <p className="max-w-xs break-all rounded-xl bg-white/5 px-3 py-2 font-mono text-[11px] text-white/50">{detected.raw}</p>
          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              onClick={startCamera}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#F2FF0B] px-5 text-sm font-bold text-black transition active:scale-[0.98]"
            >
              <RotateCcw size={18} /> Scan again
            </button>
            {onClose ? (
              <button type="button" onClick={onClose} className={backClass}>
                Close
              </button>
            ) : (
              <Link href={closeHref} className={backClass}>
                Back to home
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Camera permission denied / no camera */}
      {(phase === "denied" || phase === "no-camera") && (
        <div className="relative z-10 flex flex-1 flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-10">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <VideoOff size={28} className="text-[#FC9E3D]" />
          </span>
          <h1 className="text-2xl font-black">{phase === "denied" ? "Camera access is needed to scan" : "No camera available"}</h1>
          {phase === "denied" ? (
            <>
              <p className="text-sm text-white/75">You blocked the camera for this site. To turn it back on:</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-white/75">
                <li>iPhone: Settings → Safari → Camera → Allow</li>
                <li>Android: tap the icon left of the address bar → Permissions → Camera</li>
              </ol>
            </>
          ) : (
            <p className="text-sm text-white/75">We couldn&apos;t open a camera on this device. You can still upload a photo of the QR code.</p>
          )}
          <div className="mt-auto space-y-2">
            {uploadError && <p className="text-center text-sm text-[#FC9E3D]">{uploadError}</p>}
            <button
              type="button"
              onClick={startCamera}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#F2FF0B] px-5 text-sm font-bold text-black transition active:scale-[0.98]"
            >
              <Camera size={18} /> Try again
            </button>
            {uploadButton}
          </div>
        </div>
      )}

      {/* Social-app built-in browser */}
      {phase === "in-app" && (
        <div className="relative z-10 flex flex-1 flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-10">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <Globe size={28} className="text-[#0DFCFD]" />
          </span>
          <h1 className="text-2xl font-black">Open this page in your browser</h1>
          <p className="rounded-2xl border border-[#FC9E3D]/50 bg-[#FC9E3D]/10 p-3 text-sm text-[#ffd6a8]">
            You&apos;re inside WeChat, Instagram or another app. The camera may not work here.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-white/75">
            <li>Tap the ··· menu in the top-right corner</li>
            <li>Choose &ldquo;Open in browser&rdquo; (Safari or Chrome)</li>
          </ol>
          <div className="mt-auto space-y-2">
            {uploadError && <p className="text-center text-sm text-[#FC9E3D]">{uploadError}</p>}
            <button
              type="button"
              onClick={copyUrl}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#F2FF0B] px-5 text-sm font-bold text-black transition active:scale-[0.98]"
            >
              <Copy size={18} /> {copied ? "Link copied" : "Copy link"}
            </button>
            {uploadButton}
            <button type="button" onClick={() => setSkipInApp(true)} className="min-h-[44px] w-full text-sm font-semibold text-white/60 underline underline-offset-4">
              Try the camera anyway
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
