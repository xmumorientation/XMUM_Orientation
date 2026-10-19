// Which phone and browser the Faci is using, so location help can give the
// right steps. Only a best guess from the user agent; never used for access.

export type PhoneOs = "ios" | "android" | "other";
export type BrowserName = "safari" | "chrome" | "samsung" | "firefox" | "edge" | "other";

export interface BrowserEnv {
  os: PhoneOs;
  browser: BrowserName;
  /** Name of the app whose built-in browser this is (WhatsApp, Instagram, ...), or null. */
  inApp: string | null;
  /** Geolocation only works on https (or localhost). */
  secure: boolean;
  geolocation: boolean;
  wakeLock: boolean;
}

const IN_APP: [RegExp, string][] = [
  [/WhatsApp/i, "WhatsApp"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/MicroMessenger/i, "WeChat"],
  [/\bLine\//i, "LINE"],
  [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"],
  [/Telegram/i, "Telegram"],
  [/Snapchat/i, "Snapchat"],
  // Generic Android WebView: some other app's built-in browser.
  [/; wv\)/, "another app"],
];

export function detectBrowserEnv(): BrowserEnv {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const os: PhoneOs = ios ? "ios" : /Android/.test(ua) ? "android" : "other";

  let browser: BrowserName = "other";
  if (/CriOS/.test(ua)) browser = "chrome";
  else if (/FxiOS|Firefox/.test(ua)) browser = "firefox";
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = "edge";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/Chrome/.test(ua)) browser = "chrome";
  else if (/Safari/.test(ua)) browser = "safari";

  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;

  return {
    os,
    browser,
    inApp,
    secure: window.isSecureContext,
    geolocation: "geolocation" in navigator,
    wakeLock: "wakeLock" in navigator,
  };
}

export function browserLabel(env: BrowserEnv) {
  const names: Record<BrowserName, string> = {
    safari: "Safari",
    chrome: "Chrome",
    samsung: "Samsung Internet",
    firefox: "Firefox",
    edge: "Edge",
    other: "your browser",
  };
  return names[env.browser];
}
