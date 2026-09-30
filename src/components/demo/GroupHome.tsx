"use client";

/**
 * DEMO: Group Homepage shell after Facilitator group QR.
 *
 * Temporary open routes (`/group/demo-1`, `/group/demo-3`) for D-day walkthrough.
 * BEFORE PRODUCTION: replace with a signed, expiring Homepage pass. Do not treat
 * the URL alone as access control. No Register CTA. No public Scan / QR UI here.
 */

import Link from "next/link";
import type { CSSProperties } from "react";

import { Glow } from "@/components/home/decor";
import { FONT } from "@/components/home/data";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/home/vortexa.css";
import type { DemoGroup } from "./demo-data";
import "./demo.css";

export default function GroupHome({ group }: { group: DemoGroup }) {
  const accentStyle = {
    "--vx-demo-accent": group.color,
  } as CSSProperties;

  return (
    <div
      className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable} vx vx-demo nexus relative text-white`}
      style={{ fontFamily: FONT.body, ...accentStyle }}
    >
      <header className="vx-demo-top">
        <div className="vx-demo-top-brand">
          <span className="vx-demo-badge" aria-hidden>
            {group.number}
          </span>
          <div className="vx-demo-top-meta">
            <b>{group.name}</b>
            <span>Group {group.number} · Vortexa</span>
          </div>
        </div>
      </header>

      <div className="vx-demo-body">
        <div className="vx-dots" aria-hidden />
        <Glow
          size="min(360px, 80vw)"
          color={group.color}
          style={{ right: "-12%", top: "4%", opacity: 0.22 }}
        />

        <section className="vx-demo-card" aria-labelledby="group-faci-tip">
          <h2 id="group-faci-tip">Facilitator tip</h2>
          <p>{group.faciTip}</p>
        </section>

        <section className="vx-demo-card" aria-labelledby="group-schedule">
          <h2 id="group-schedule">Schedule</h2>
          <p>Your group timetable will appear here once published.</p>
          <div className="vx-demo-empty">
            <b>Nothing scheduled yet</b>
            <span>Honest empty state — no placeholder events. Check back closer to 28 Nov 2026.</span>
          </div>
        </section>

        <section className="vx-demo-card" aria-labelledby="group-tasks">
          <h2 id="group-tasks">Tasks</h2>
          <p>Orientation tasks for this group will show up here.</p>
          <div className="vx-demo-empty">
            <b>No tasks yet</b>
            <span>Empty on purpose for this demo. Live tasks come from the event backend later.</span>
          </div>
        </section>

        <p className="vx-demo-note">
          Changed phones? Scan your Facilitator&apos;s group QR again on the new device.
        </p>

        <p className="vx-demo-warn">
          DEMO ROUTE — temporary. Production must use a signed / expiring Homepage pass;
          do not rely on this URL alone for access.
        </p>

        <div className="vx-demo-foot">
          <Link href="/">← Welcome</Link>
        </div>
      </div>
    </div>
  );
}
