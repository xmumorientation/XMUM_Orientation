"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { FONT } from "@/components/home/data";
import { Glow, Spark } from "@/components/home/decor";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/home/vortexa.css";

/**
 * Shared layout for every login page (Freshie, Committee/Faci/GM, password
 * reset): dark night background, centred Vortexa wordmark, one column of
 * pill inputs and buttons, and a back link at the bottom.
 */
export function AuthShell({
  role,
  lead,
  children,
  backHref = "/",
  backLabel = "Back to Welcome",
}: {
  /** Short line under the wordmark naming who this page is for. */
  role?: string;
  lead?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <div className="vx vx-login" style={{ fontFamily: FONT.body }}>
        <div className="vx-dots" />
        <Glow size="min(520px, 90vw)" color="var(--vx-navy)" style={{ left: "-8%", top: "8%", opacity: 0.8 }} />
        <Glow size="min(380px, 70vw)" color="var(--vx-pink)" style={{ right: "-6%", bottom: "-8%" }} />
        <Spark size={22} color="var(--vx-yellow)" style={{ left: "10%", top: "14%" }} />
        <Spark size={16} color="var(--vx-cyan)" style={{ right: "12%", top: "19%" }} />

        <main className="vx-login-card">
          <div className="vx-eyebrow">XMUM 26/12 Orientation</div>
          <h1 style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span className="vx-welcome-pre">WELCOME TO</span>
            <span className="vx-welcome-mark vx-holo">Vortexa</span>
          </h1>
          {role && <p className="vx-login-role">{role}</p>}
          {lead && <p className="vx-welcome-slogan">{lead}</p>}

          {children}

          <Link href={backHref} className="vx-login-back">
            <ArrowLeft size={18} aria-hidden /> {backLabel}
          </Link>
        </main>
      </div>
    </div>
  );
}
