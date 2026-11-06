"use client";

const FEEDBACK_URL = "https://forms.gle/gcFHEWHCMzKgMcbMA";
export function SupportLinks({ variant = "inline" }: { variant?: "inline" | "menu" }) {
  return (
    <div className={`support-links${variant === "menu" ? " support-links-menu" : ""}`}>
      {variant === "inline" && <span>Need more help?</span>}
      <a role={variant === "menu" ? "menuitem" : undefined} href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give Feedback</a>
    </div>
  );
}
