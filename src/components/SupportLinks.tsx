"use client";

const FEEDBACK_URL = "https://forms.gle/gcFHEWHCMzKgMcbMA";
const SUPPORT_URL = "https://wa.me/601110576001";

function describeDeviceAndBrowser(userAgent: string) {
  const device = /iPhone/i.test(userAgent) ? "iPhone"
    : /iPad/i.test(userAgent) ? "iPad"
    : /Android/i.test(userAgent) ? "Android"
    : /Windows/i.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS X/i.test(userAgent) ? "Mac"
    : /Linux/i.test(userAgent) ? "Linux"
    : "Other device";
  const browser = /Edg|EdgiOS|EdgA/i.test(userAgent) ? "Edge"
    : /SamsungBrowser/i.test(userAgent) ? "Samsung Internet"
    : /Firefox|FxiOS/i.test(userAgent) ? "Firefox"
    : /CriOS|Chrome|Chromium/i.test(userAgent) ? "Chrome"
    : /Safari/i.test(userAgent) ? "Safari"
    : "Other browser";
  return `${device}, ${browser}`;
}

function supportMessage() {
  const page = `${window.location.origin}${window.location.pathname}`;
  const deviceAndBrowser = describeDeviceAndBrowser(navigator.userAgent);
  return `Hi Tech Team, I need help with the Vortexa website.

Problem (reply with a number):
1. Login or account
2. QR or NFC scan, or check-in
3. Map or finding a location
4. Game or current stage
5. Website error or loading
6. Other

What happened?

Page: ${page}
Device/browser: ${deviceAndBrowser}

Please reply with the issue number and briefly describe what happened. A screenshot is optional.`;
}

export function SupportLinks({ variant = "inline" }: { variant?: "inline" | "menu" }) {
  return (
    <div className={`support-links${variant === "menu" ? " support-links-menu" : ""}`}>
      {variant === "inline" && <span>Need more help?</span>}
      <a
        role={variant === "menu" ? "menuitem" : undefined}
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.currentTarget.href = `${SUPPORT_URL}?text=${encodeURIComponent(supportMessage())}`;
        }}
      >Contact Tech Team</a>
      <a role={variant === "menu" ? "menuitem" : undefined} href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give Feedback</a>
    </div>
  );
}
