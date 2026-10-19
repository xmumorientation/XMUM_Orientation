// This site's base URL for links baked into QR codes and NFC stickers, from
// NEXT_PUBLIC_SITE_URL. The value is often set without a scheme
// ("xmum-orientation.vercel.app"); a QR holding that is read as plain text by
// phone cameras, so a missing scheme is filled in (https, or http for a local
// host) and a trailing slash dropped.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

export function normalizeSiteUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "http://localhost:3000";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `${LOCAL_HOST.test(value) ? "http" : "https"}://${value}`;
  return withScheme.replace(/\/+$/, "");
}

export function siteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}
