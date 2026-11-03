"use client";

import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";

import { ACTION_PLANS, isPdf, type ActionPlan } from "@/lib/actionPlans";

import "./action-plan.css";

// Day 1 and Day 2 action plans as two expandable cards, shown on Home to every
// role except Freshie. The files live in public/action-plans/ and are listed in
// lib/actionPlans.ts. Colours come from --fh-* so they follow the page.

function PlanBody({ plan }: { plan: ActionPlan }) {
  const [missing, setMissing] = useState(false);
  const pdf = isPdf(plan.file);

  if (!pdf && missing) return <p className="ap-empty">This action plan has not been uploaded yet.</p>;

  return (
    <>
      {pdf ? (
        <object className="ap-pdf" data={plan.file} type="application/pdf" aria-label={plan.title}>
          <p className="ap-empty">This device cannot show the PDF here. Use Open Full Size below.</p>
        </object>
      ) : (
        // A plain img: the plan is a static file, and Next's optimiser would blur small print.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ap-img" src={plan.file} alt={plan.title} loading="lazy" onError={() => setMissing(true)} />
      )}
      <a className="ap-open" href={plan.file} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden /> Open Full Size
      </a>
    </>
  );
}

function PlanCard({ plan }: { plan: ActionPlan }) {
  const [open, setOpen] = useState(false);
  const panelId = `ap-panel-${plan.id}`;
  return (
    <li className="ap-card" data-open={open ? "" : undefined}>
      <button type="button" className="ap-head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className="ap-ic" aria-hidden>
          <FileText size={20} />
        </span>
        <span className="ap-text">
          <b>{plan.title}</b>
          <small>{plan.subtitle}</small>
        </span>
        <ChevronDown className="ap-chev" size={20} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="ap-body">
          <PlanBody plan={plan} />
        </div>
      )}
    </li>
  );
}

export function ActionPlanCards() {
  return (
    <ul className="ap-list">
      {ACTION_PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </ul>
  );
}

/** One Home stop (snap section) holding the cards, for FreshieHome (Faci) and StaffHome. */
export function ActionPlanStop() {
  return (
    <section id="ap-plan" className="fh-stop" aria-labelledby="ap-plan-title">
      <div className="fh-stop-head">
        <h2 id="ap-plan-title" className="fh-h2 fh-slab">Action Plan</h2>
        <p className="fh-lead">Tap a day to open its plan.</p>
      </div>
      <ActionPlanCards />
    </section>
  );
}

export const ACTION_PLAN_STOP = { id: "ap-plan", label: "Action Plan" } as const;
