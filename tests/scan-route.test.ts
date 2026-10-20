import { describe, expect, it } from "vitest";

import { blindBoxToken, blindBoxUrl, verifyBlindBoxToken } from "../src/lib/blindbox";
import { classifyScan } from "../src/lib/scan-route";
import { normalizeSiteUrl } from "../src/lib/site-url";

const SITE = "https://vortexa.example";
const ORIGINS = [SITE, "http://localhost:3000"];

describe("classifyScan", () => {
  it("opens the blind box link inside the app, whichever configured origin minted it", () => {
    for (const base of ORIGINS) {
      const r = classifyScan(`${base}/blindbox?t=abc.def`, ORIGINS);
      expect(r).toEqual({ kind: "app", path: "/blindbox?t=abc.def", label: "Blind box" });
    }
  });

  it("opens any other page of this site inside the app", () => {
    expect(classifyScan(`${SITE}/activate?t=xyz`, ORIGINS)).toMatchObject({ kind: "app", path: "/activate?t=xyz", label: "Projector card" });
    expect(classifyScan(`${SITE}/inventory`, ORIGINS)).toMatchObject({ kind: "app", path: "/inventory", label: "App link" });
    expect(classifyScan(`  ${SITE}/map  `, ORIGINS)).toMatchObject({ kind: "app", path: "/map" });
  });

  it("never follows group-login or auth links from the scanner", () => {
    for (const p of ["/join?group1=1234", "/login/freshie", "/login", "/auth/callback?code=1", "/api/admin/seed-test-accounts"]) {
      expect(classifyScan(`${SITE}${p}`, ORIGINS).kind).toBe("blocked");
    }
  });

  it("does not treat look-alike paths as blocked", () => {
    expect(classifyScan(`${SITE}/joined-groups`, ORIGINS).kind).toBe("app");
  });

  it("shows links to other sites instead of following them", () => {
    expect(classifyScan("https://example.com/promo", ORIGINS)).toEqual({ kind: "link", url: "https://example.com/promo" });
    // a host that only starts like ours is another site
    expect(classifyScan("https://vortexa.example.evil.com/blindbox?t=1", ORIGINS).kind).toBe("link");
    expect(classifyScan("http://vortexa.example/blindbox?t=1", ORIGINS).kind).toBe("link"); // other scheme = other origin
  });

  it("shows plain text and non-web links as text", () => {
    expect(classifyScan("WIFI:T:WPA;S:cafe;P:secret;;", ORIGINS)).toEqual({ kind: "text", text: "WIFI:T:WPA;S:cafe;P:secret;;" });
    expect(classifyScan("tel:+60123456789", ORIGINS).kind).toBe("text");
    expect(classifyScan("javascript:alert(1)", ORIGINS).kind).toBe("text");
    expect(classifyScan("", ORIGINS).kind).toBe("text");
  });

  it("never turns a double-slash path into a link to another site", () => {
    expect(classifyScan(`${SITE}//evil.com/x`, ORIGINS)).toMatchObject({ kind: "app", path: "/evil.com/x" });
    expect(classifyScan("vortexa.example//evil.com/x", ORIGINS)).toMatchObject({ kind: "app", path: "/evil.com/x" });
    expect(classifyScan(`${SITE}/\\evil.com`, ORIGINS)).toMatchObject({ kind: "app", path: "/evil.com" });
    // a code minted from a site URL ending in "/" still opens the blind box
    expect(classifyScan(`${SITE}//blindbox?t=abc`, ORIGINS)).toEqual({ kind: "app", path: "/blindbox?t=abc", label: "Blind box" });
    // and the login block still applies
    expect(classifyScan(`${SITE}//join?group1=1`, ORIGINS).kind).toBe("blocked");
  });

  it("opens a scheme-less link to this site, but leaves other bare hosts as text", () => {
    expect(classifyScan("vortexa.example/blindbox?t=abc.def", ORIGINS)).toEqual({ kind: "app", path: "/blindbox?t=abc.def", label: "Blind box" });
    expect(classifyScan("example.com/promo", ORIGINS).kind).toBe("text");
    expect(classifyScan("vortexa.example", ORIGINS).kind).toBe("text");
  });
});

describe("normalizeSiteUrl", () => {
  it("adds https to a bare host, so a QR built from it is a link", () => {
    expect(normalizeSiteUrl("xmum-orientation.vercel.app")).toBe("https://xmum-orientation.vercel.app");
    expect(normalizeSiteUrl(" xmum-orientation.vercel.app/ ")).toBe("https://xmum-orientation.vercel.app");
  });

  it("keeps a given scheme, uses http for a local host, and defaults to localhost", () => {
    expect(normalizeSiteUrl("https://vortexa.example/")).toBe("https://vortexa.example");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl(undefined)).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("")).toBe("http://localhost:3000");
  });

  it("blind box links always carry a scheme", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "xmum-orientation.vercel.app";
    try {
      expect(blindBoxUrl("abc.def")).toBe("https://xmum-orientation.vercel.app/blindbox?t=abc.def");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});

describe("blind box token", () => {
  process.env.NFC_TOKEN_SECRET = "test-secret-at-least-16-chars";

  it("is the same every time for one seller, so one QR stays valid", () => {
    expect(blindBoxToken(7, 1)).toBe(blindBoxToken(7, 1));
  });

  it("round-trips the seller and version", () => {
    expect(verifyBlindBoxToken(blindBoxToken(7, 3))).toEqual({ valid: true, sellerId: 7, version: 3 });
  });

  it("a regenerated version is a different token", () => {
    expect(blindBoxToken(7, 2)).not.toBe(blindBoxToken(7, 1));
  });

  it("rejects tampered, old-format and foreign tokens", () => {
    const good = blindBoxToken(7, 1);
    const [body, sig] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "bb3", s: 8, v: 1 })).toString("base64url");
    expect(verifyBlindBoxToken(`${forged}.${sig}`).valid).toBe(false);
    expect(verifyBlindBoxToken(`${body}.AAAA`).valid).toBe(false);
    expect(verifyBlindBoxToken("garbage").valid).toBe(false);
    // the old per-type format (kind bb2) no longer opens anything
    const old = Buffer.from(JSON.stringify({ k: "bb2", a: 1, v: 1 })).toString("base64url");
    expect(verifyBlindBoxToken(`${old}.${sig}`).valid).toBe(false);
  });

  it("the scanner sends a blind box link to the page", () => {
    const url = blindBoxUrl(blindBoxToken(7, 1));
    expect(classifyScan(url, [new URL(url).origin])).toMatchObject({ kind: "app", label: "Blind box" });
  });
});
