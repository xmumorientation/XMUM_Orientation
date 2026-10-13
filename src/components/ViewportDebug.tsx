"use client";

import { useEffect, useRef, useState } from "react";

// TEMPORARY: viewport diagnostics for the iPad Chrome blank-bottom bug
// (2026-10-13). Shows only with ?vp=1 in the URL. Remove once fixed.
//
// Draws two markers so a screenshot shows which "bottom" each source uses:
//   lime    = where position: fixed; bottom: 0 ends
//   magenta = window.innerHeight
// and lists every height the browser reports.

type Row = [string, string];

function measure(probe: HTMLDivElement | null, fixedProbe: HTMLDivElement | null): Row[] {
  const px = (unit: string) => {
    if (!probe) return "?";
    probe.style.height = unit;
    return `${Math.round(probe.getBoundingClientRect().height)}`;
  };
  const vv = window.visualViewport;
  const ua = navigator.userAgent;
  const browser = /CriOS/.test(ua) ? "Chrome iOS" : /FxiOS/.test(ua) ? "Firefox iOS" : /Safari/.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Chrome/.test(ua) ? "Chrome" : "other";
  const fixedBottom = fixedProbe ? Math.round(fixedProbe.getBoundingClientRect().bottom) : "?";
  let safeBottom = "?";
  if (probe) {
    probe.style.height = "0px";
    probe.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
    safeBottom = `${Math.round(probe.getBoundingClientRect().height)}`;
    probe.style.paddingBottom = "0px";
  }
  return [
    ["browser", browser],
    ["orientation", window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape"],
    ["innerW x innerH", `${window.innerWidth} x ${window.innerHeight}`],
    ["outerW x outerH", `${window.outerWidth} x ${window.outerHeight}`],
    ["visualViewport", vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} scale ${vv.scale.toFixed(2)}` : "none"],
    ["html clientH", `${document.documentElement.clientHeight}`],
    ["screen", `${screen.width} x ${screen.height} dpr ${window.devicePixelRatio}`],
    ["100vh", px("100vh")],
    ["100dvh", px("100dvh")],
    ["100svh", px("100svh")],
    ["100lvh", px("100lvh")],
    ["fixed bottom:0 at", `${fixedBottom}`],
    ["safe-area bottom", safeBottom],
    ["scrollY", `${Math.round(window.scrollY)}`],
    ["time", new Date().toLocaleTimeString()],
  ];
}

export function ViewportDebug() {
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [innerH, setInnerH] = useState(0);
  const probe = useRef<HTMLDivElement>(null);
  const fixedProbe = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get("vp") === "1");
  }, []);

  useEffect(() => {
    if (!on) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRows(measure(probe.current, fixedProbe.current));
        setInnerH(window.innerHeight);
      });
    };
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [on]);

  if (!on) return null;

  return (
    <>
      {/* Hidden ruler for the CSS viewport units. */}
      <div ref={probe} aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 1, visibility: "hidden", pointerEvents: "none" }} />
      {/* Lime: the bottom that position: fixed; bottom: 0 uses. */}
      <div
        ref={fixedProbe}
        aria-hidden
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 6, background: "#39ff14", zIndex: 2147483646, pointerEvents: "none" }}
      />
      {/* Magenta: window.innerHeight. */}
      <div
        aria-hidden
        style={{ position: "fixed", left: 0, right: "50%", top: Math.max(0, innerH - 6), height: 6, background: "#ff00e6", zIndex: 2147483647, pointerEvents: "none" }}
      />
      <div
        style={{
          position: "fixed", top: 8, left: 8, zIndex: 2147483647, maxWidth: "calc(100vw - 16px)",
          padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.82)", color: "#fff",
          font: "12px/1.45 ui-monospace, Menlo, monospace", pointerEvents: "none", whiteSpace: "pre",
        }}
      >
        {rows.map(([k, v]) => `${k.padEnd(18)} ${v}`).join("\n")}
        {"\n"}lime = fixed bottom:0 · magenta = innerHeight
      </div>
    </>
  );
}
