"use client";

import { ChevronDown, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

import type { ResolvedHomeSection } from "@/lib/homeSections";

import "./home-sections.css";

// The files HOF, OC, HOGM and Admin put on Home (Settings → Home Sections), as
// expandable cards. Shown to the roles each one lists, on FreshieHome (Freshie
// and Faci), StaffHome (HOF, OC, HOGM, Committee, GM) and StaffDashboard (Admin,
// Guardian GM). Colours come from --fh-* so they follow the page.

function SectionBody({ section }: { section: ResolvedHomeSection }) {
  const [broken, setBroken] = useState(false);
  const pdf = section.file_kind === "pdf";

  if (!pdf && broken) return <p className="hs-empty">This file could not be loaded. Try again later.</p>;

  return (
    <>
      {pdf ? (
        <object className="hs-pdf" data={section.url} type="application/pdf" aria-label={section.title}>
          <p className="hs-empty">This device cannot show the PDF here. Use Open Full Size below.</p>
        </object>
      ) : (
        // A plain img: the file is shown as uploaded, and Next's optimiser would blur small print.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hs-img" src={section.url} alt={section.title} loading="lazy" onError={() => setBroken(true)} />
      )}
      <a className="hs-open" href={section.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden /> Open Full Size
      </a>
    </>
  );
}

function SectionCard({ section }: { section: ResolvedHomeSection }) {
  const [open, setOpen] = useState(false);
  const panelId = `hs-panel-${section.id}`;
  const Icon = section.file_kind === "pdf" ? FileText : ImageIcon;
  return (
    <li className="hs-card" data-open={open ? "" : undefined}>
      <button type="button" className="hs-head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className="hs-ic" aria-hidden>
          <Icon size={20} />
        </span>
        <span className="hs-text">
          <b>{section.title}</b>
          <small>{section.file_kind === "pdf" ? "PDF" : "Image"}</small>
        </span>
        <ChevronDown className="hs-chev" size={20} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="hs-body">
          <SectionBody section={section} />
        </div>
      )}
    </li>
  );
}

export function HomeSectionCards({ sections }: { sections: ResolvedHomeSection[] }) {
  return (
    <ul className="hs-list">
      {sections.map((s) => (
        <SectionCard key={s.id} section={s} />
      ))}
    </ul>
  );
}

/** One Home stop (snap section) holding the cards, for FreshieHome and StaffHome. */
export function HomeSectionsStop({ sections }: { sections: ResolvedHomeSection[] }) {
  return (
    <section id="hs-docs" className="fh-stop" aria-labelledby="hs-docs-title">
      <div className="fh-stop-head">
        <h2 id="hs-docs-title" className="fh-h2 fh-slab">Documents</h2>
        <p className="fh-lead">Tap a document to open it.</p>
      </div>
      <HomeSectionCards sections={sections} />
    </section>
  );
}

export const HOME_SECTIONS_STOP = { id: "hs-docs", label: "Documents" } as const;
