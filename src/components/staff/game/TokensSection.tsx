"use client";

import { Lock, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useConfig } from "@/components/useConfig";
import { fetchGameConfigRules, resetAllTokensAndPuzzles, updateGameConfigRule } from "@/lib/token-api";
import { TOKEN_RULES, type TokenRuleKey } from "@/lib/token-types";
import { cn } from "@/lib/utils";

import { ConfirmSheet, StatusLine, useStatus } from "./parts";

// Admin → Tokens for HOGM: the token rules GMs pay and charge, and Reset
// (Rehearsal mode only). Same calls: fn_update_game_config_rule,
// fn_reset_tokens_and_puzzles.

type Rules = Record<TokenRuleKey, number>;
const FALLBACK = Object.fromEntries(TOKEN_RULES.map((r) => [r.key, r.fallback])) as Rules;

export function TokensSection() {
  const { config } = useConfig();
  const rehearsal = config["rehearsal_mode"] === true || config["rehearsal_mode"] === "true";
  const { error, setError, notice, flash } = useStatus();
  const [rules, setRules] = useState<Rules>(FALLBACK);
  const [draft, setDraft] = useState<Partial<Rules>>({});
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    const rows = await fetchGameConfigRules();
    setRules((cur) => {
      const next = { ...cur };
      for (const r of rows) if (r.rule_key in next) next[r.rule_key as TokenRuleKey] = r.rule_value;
      return next;
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = TOKEN_RULES.filter((r) => draft[r.key] !== undefined && draft[r.key] !== rules[r.key]);

  async function save() {
    for (const r of dirty) {
      const v = draft[r.key] as number;
      if (!Number.isInteger(v) || v < r.min || v > 50) return setError(`${r.label}: a whole number from ${r.min} to 50.`);
    }
    setBusy(true);
    for (const r of dirty) {
      const res = await updateGameConfigRule(r.key, draft[r.key] as number);
      if (!res.ok) {
        setBusy(false);
        return setError(res.error ?? "Not saved.");
      }
    }
    setBusy(false);
    setDraft({});
    flash("Saved. GMs use the new amounts now.");
    load();
  }

  async function reset() {
    setBusy(true);
    try {
      await resetAllTokensAndPuzzles();
      flash("Tokens and puzzles reset");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    setResetting(false);
  }

  return (
    <div className="gc-stack">
      <div className="gc-grid2">
        {([1, 2] as const).map((day) => (
          <section key={day} className="gc-card gc-rules" aria-labelledby={`gc-rules-${day}`}>
            <h3 id={`gc-rules-${day}`} className="gc-eyebrow">
              {day === 1 ? "Day 1 / rewards" : "Day 2 / entry fee"}
            </h3>
            {TOKEN_RULES.filter((r) => r.day === day).map((r) => {
              const value = draft[r.key] ?? rules[r.key];
              const changed = draft[r.key] !== undefined && draft[r.key] !== rules[r.key];
              return (
                <label key={r.key} className="gc-rule">
                  <span>
                    <b>{r.label}</b>
                    <small>{r.hint}</small>
                  </span>
                  <span className={cn("gc-rule-in", r.sign > 0 ? "is-plus" : "is-minus", changed && "is-dirty")}>
                    {r.sign > 0 ? "+" : "−"}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={r.min}
                      max={50}
                      aria-label={`Day ${day} ${r.label} tokens`}
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [r.key]: Math.trunc(Number(e.target.value)) }))}
                    />
                  </span>
                </label>
              );
            })}
          </section>
        ))}
      </div>
      <button type="button" className="gc-btn gc-btn-primary" disabled={busy || dirty.length === 0} onClick={save}>
        {dirty.length ? `Save ${dirty.length} change${dirty.length > 1 ? "s" : ""}` : "Saved"}
      </button>
      <StatusLine error={error} notice={notice} />

      <section className="gc-card gc-danger" aria-labelledby="gc-reset">
        <div>
          <h3 id="gc-reset" className="gc-h4">Reset tokens and puzzles</h3>
          <p>{rehearsal ? "Every group to 0, all pieces removed." : "Locked until Admin turns on Rehearsal mode."}</p>
        </div>
        <button type="button" className="gc-btn gc-btn-danger" disabled={!rehearsal || busy} onClick={() => setResetting(true)}>
          {rehearsal ? <RotateCcw size={15} aria-hidden /> : <Lock size={15} aria-hidden />} Reset
        </button>
      </section>

      <ConfirmSheet
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={reset}
        busy={busy}
        danger
        typeToConfirm="RESET"
        title="Reset tokens and puzzles?"
        confirmLabel="Reset everything"
        body="Every group goes to 0 tokens and loses every puzzle piece. The token log is cleared."
      />
    </div>
  );
}
