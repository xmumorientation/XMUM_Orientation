import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { denialReasonMessage } from "@/lib/group-pass";

/**
 * Plain-English denial when /group/* is opened without a valid signed pass.
 * Mobile-friendly; no redesign of the main brand system.
 */

export const metadata: Metadata = {
  title: "Group pass required — Vortexa",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07060b",
};

type Props = {
  searchParams: Promise<{ reason?: string; g?: string }>;
};

export default async function GroupPassDeniedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { title, body } = denialReasonMessage(sp.reason ?? "missing");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        background: "#07060b",
        color: "#f4f2ff",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          padding: "28px 22px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(244,242,255,0.55)",
          }}
        >
          XMUM Orientation
        </p>
        <h1
          style={{
            margin: "10px 0 0",
            fontSize: 22,
            lineHeight: 1.25,
            fontWeight: 700,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 15,
            lineHeight: 1.55,
            color: "rgba(244,242,255,0.78)",
          }}
        >
          {body}
        </p>
        {sp.g ? (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "rgba(244,242,255,0.45)",
            }}
          >
            Requested group: {sp.g}
          </p>
        ) : null}
        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/check-in/draw"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#00cfff",
              color: "#07060b",
              fontWeight: 650,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Backup draw
          </Link>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#f4f2ff",
              fontWeight: 550,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to Welcome
          </Link>
        </div>
      </div>
    </main>
  );
}
