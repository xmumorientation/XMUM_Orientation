"use client";

import React, { useState } from "react";
import { COMMITTEES, type Committee } from "../data";
import {
  Code,
  Calendar,
  Briefcase,
  Users,
  Gamepad2,
  Megaphone,
  Wallet,
  FileText,
  Palette,
  Camera,
} from "lucide-react";

const COMMITTEE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Code,
  Calendar,
  Briefcase,
  Users,
  Gamepad2,
  Megaphone,
  Wallet,
  FileText,
  Palette,
  Camera,
};

export function Committees() {
  const [activeCommittee, setActiveCommittee] = useState<Committee | null>(null);

  return (
    <section id="committees" className="vx-sec" aria-labelledby="committees-title">
      <div className="vx-inner">
        <div className="vx-comm-head vx-rise">
          <h2 id="committees-title" className="vx-h2">Meet the crew</h2>
          <p className="vx-lead">Ten committees running the park. Tap one to see what they do.</p>
        </div>

        <div className="vx-cgrid vx-rise-2">
          {COMMITTEES.map((c) => {
            const Icon = COMMITTEE_ICONS[c.icon] || Users;
            const isSelected = activeCommittee?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className="vx-card vx-cm"
                aria-expanded={isSelected}
                aria-controls="committee-detail"
                onClick={() => setActiveCommittee(isSelected ? null : c)}
              >
                <span className="vx-cm-ic" style={{ background: c.color }} aria-hidden>
                  <Icon size={18} />
                </span>
                <b>{c.name}</b>
                <span className="vx-cm-full">{c.fullName}</span>
              </button>
            );
          })}
        </div>

        <div id="committee-detail" aria-live="polite">
          {activeCommittee && (
            <div className="vx-card vx-cdetail" style={{ borderColor: activeCommittee.color }}>
              <div className="vx-cdetail-main">
                <b>
                  {activeCommittee.name} · {activeCommittee.fullName}
                </b>
                <p>{activeCommittee.desc}</p>
              </div>
              <dl>
                <div>
                  <dt className="vx-mono">Committee head</dt>
                  <dd>{activeCommittee.head || "TBD"}</dd>
                </div>
                <div>
                  <dt className="vx-mono">Members</dt>
                  <dd>{activeCommittee.members !== null ? activeCommittee.members : "TBD"}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
