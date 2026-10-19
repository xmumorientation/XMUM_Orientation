"use client";

import { browserLabel, type BrowserEnv } from "@/lib/browserEnv";

export type LocationProblem =
  | "denied"
  | "imprecise"
  | "unavailable"
  | "inapp"
  | "insecure"
  | "nowake";

/** Step-by-step fix for a location problem, for this phone and browser. */
export function locationSteps(problem: LocationProblem, env: BrowserEnv): string[] {
  const name = browserLabel(env);
  const iosApp = env.browser === "safari" ? "Safari Websites" : name;

  switch (problem) {
    case "inapp":
      return [
        `This page is open inside ${env.inApp}, which often blocks location.`,
        env.os === "ios"
          ? "Tap the ⋯ or share button and choose \"Open in Safari\" (or Open in browser)."
          : "Tap ⋮ and choose \"Open in Chrome\" (or Open in browser).",
        "Log in again there. Keep using that browser for the rest of the day.",
      ];

    case "insecure":
      return [
        "Location only works on the secure (https://) address of this site.",
        "Open the site from the official link, not an IP address or http:// link.",
      ];

    case "denied":
      if (env.os === "ios") {
        return env.browser === "safari"
          ? [
              "Tap \"aA\" in the address bar → Website Settings → Location → Allow.",
              "Still blocked? Settings → Privacy & Security → Location Services: turn it on, then Safari Websites → While Using the App.",
              "Come back here and tap Try again (reload the page if nothing changes).",
            ]
          : [
              `Settings → Privacy & Security → Location Services: turn it on.`,
              `In the same list tap ${name} → While Using the App, and turn on Precise Location.`,
              "Come back here, reload the page, and tap Allow when asked.",
            ];
      }
      if (env.os === "android") {
        return [
          "Tap the icon left of the web address → Permissions (or Site settings) → Location → Allow.",
          `Also check: phone Settings → Location is on, and Settings → Apps → ${name} → Permissions → Location → Allow only while using the app.`,
          "Come back here and tap Try again.",
        ];
      }
      return [
        "Click the icon left of the web address and allow Location for this site.",
        "Then tap Try again.",
      ];

    case "imprecise":
      if (env.os === "ios") {
        return [
          `Settings → Privacy & Security → Location Services → ${iosApp}.`,
          "Turn on Precise Location (and choose While Using the App).",
          "Come back here and tap Try again. Outdoors works best.",
        ];
      }
      if (env.os === "android") {
        return [
          `Settings → Apps → ${name} → Permissions → Location → turn on "Use precise location".`,
          "Settings → Location → Location services → turn on Google Location Accuracy.",
          "Come back here and tap Try again. Outdoors works best.",
        ];
      }
      return [
        "Your device only gives a rough location. Use a phone with GPS if you can.",
      ];

    case "unavailable":
      if (env.os === "ios") {
        return [
          "Settings → Privacy & Security → Location Services: make sure it is on.",
          "Turn Airplane Mode off and Wi-Fi on (Wi-Fi helps the phone find itself).",
          "Step outside or near a window, then tap Try again.",
        ];
      }
      return [
        "Pull down the quick settings and turn Location on.",
        "Turn Wi-Fi on (it helps the phone find itself, even without connecting).",
        "Step outside or near a window, then tap Try again.",
      ];

    case "nowake":
      return env.os === "ios"
        ? [
            "This browser can't keep the screen on by itself.",
            "Settings → Display & Brightness → Auto-Lock → Never, for the event day.",
            "Set it back afterwards to save battery.",
          ]
        : [
            "This browser can't keep the screen on by itself.",
            "Settings → Display → Screen timeout → set the longest time.",
          ];
  }
}

export function LocationHelp({
  problem,
  env,
  className,
}: {
  problem: LocationProblem;
  env: BrowserEnv;
  className?: string;
}) {
  return (
    <ol className={`list-decimal space-y-1 pl-4 ${className ?? ""}`}>
      {locationSteps(problem, env).map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
