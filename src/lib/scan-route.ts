// What the in-app scanner does with a scanned QR code. Pure, so it is unit
// tested (tests/scan-route.test.ts) and the same on every device.
//
//   app      a link to this site: open it inside the app (blind box, NFC
//            activation, group pass, ...). The page itself checks the code.
//   blocked  a link to this site that must not be followed from the scanner
//            (a group login link would sign the group out and switch it).
//   link     a link to another site: shown with its address, opened only if
//            the Freshie taps "Open link". Never followed automatically.
//   text     anything else (plain text, a phone number, ...): shown, copyable.

export type ScanRoute =
  | { kind: "app"; path: string; label: string }
  | { kind: "blocked"; reason: string }
  | { kind: "link"; url: string }
  | { kind: "text"; text: string };

// Same-site paths the scanner never follows.
const BLOCKED: { prefix: string; reason: string }[] = [
  { prefix: "/join", reason: "This is a group login code. Scanning it here would sign your group out. Ask your Facilitator how to use it." },
  { prefix: "/login", reason: "This is a login page, not something to scan in the app." },
  { prefix: "/forgot-password", reason: "This is a login page, not something to scan in the app." },
  { prefix: "/reset-password", reason: "This is a login page, not something to scan in the app." },
  { prefix: "/auth", reason: "This is a login link, not something to scan in the app." },
  { prefix: "/api", reason: "This is not a page." },
];

const LABELS: { prefix: string; label: string }[] = [
  { prefix: "/blindbox", label: "Blind box" },
  { prefix: "/activate", label: "Projector card" },
  { prefix: "/group", label: "Group pass" },
];

const norm = (u: URL) => u.origin.toLowerCase();

/**
 * @param raw     the text the QR code decoded to
 * @param origins this site's origin(s): the browser's own, plus the
 *                configured NEXT_PUBLIC_SITE_URL (they differ behind a tunnel
 *                or a custom domain, and a QR minted with one must still work)
 */
export function classifyScan(raw: string, origins: string[]): ScanRoute {
  const text = raw.trim();
  if (!text) return { kind: "text", text: raw };

  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  const own = origins.filter(Boolean).map((o) => {
    try {
      return norm(new URL(o));
    } catch {
      return "";
    }
  });

  // A link to this site minted without a scheme ("host/blindbox?t=..."), from
  // before the site URL was normalised: open it as this site's https link.
  // Scheme-less text naming any other host stays text.
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    let bare: URL | null = null;
    try {
      bare = /^[^\s/:]+(:\d+)?\//.test(text) ? new URL(`https://${text}`) : null;
    } catch {
      bare = null;
    }
    if (!bare || !own.includes(norm(bare))) return { kind: "text", text };
    url = bare;
  }
  if (!own.includes(norm(url))) {
    return { kind: "link", url: url.toString() };
  }

  // "https://our-site//evil.com/x" has our origin, but "//evil.com/x" handed to
  // the router is a protocol-relative link to another site. Collapse leading
  // slashes so the path always stays on this site (this also fixes codes
  // minted from a site URL that ended in "/").
  const path = url.pathname.replace(/^[/\\]+/, "/");
  for (const b of BLOCKED) {
    if (path === b.prefix || path.startsWith(b.prefix + "/")) {
      return { kind: "blocked", reason: b.reason };
    }
  }
  const label = LABELS.find((l) => path === l.prefix || path.startsWith(l.prefix + "/"))?.label ?? "App link";
  return { kind: "app", path: path + url.search, label };
}
