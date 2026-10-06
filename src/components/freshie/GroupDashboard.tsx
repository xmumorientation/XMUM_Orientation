"use client";

import { CalendarDays, HelpCircle, History, MapPin, Package, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group, ScheduleItem } from "@/lib/types";

export function GroupDashboard({ group, loading, phase, credits }: { group: Group | null; loading: boolean; phase?: ReactNode; credits?: ReactNode }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("schedule_items").select("*").order("day_label").order("sort_order").order("id");
    return { data: (data as ScheduleItem[] | null) ?? [], error: Boolean(error) };
  }, [supabase]);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const result = await load(); if (active) { setError(result.error); setItems(result.data); } };
    void refresh();
    const channel = supabase.channel("group-dashboard-schedule").on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, refresh).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [load, supabase]);
  const retry = async () => { setItems(null); const result = await load(); setError(result.error); setItems(result.data); };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const day = today === "2026-11-29" ? "Day 2" : "Day 1";
  const dayItems = (items ?? []).filter(item => item.day_label === day);
  return (
    <main className="gd" id="fh-welcome">
      <section className="gd-arrival" aria-labelledby="gd-title">
        <h1 id="gd-title">Welcome to <span>Vortexa</span></h1>
        <div className="gd-identity">
          <span className="gd-number">{group ? String(group.id).padStart(2, "0") : "–"}</span>
          <div><p className="gd-group">{loading ? "Loading your group…" : group?.display_name || group?.name || "Group not assigned"}</p><p className="gd-slogan">{group?.slogan || (group ? `Group ${group.id}. Ready for the adventure.` : "Ask your facilitator for help.")}</p></div>
        </div>
      </section>
      <div className="gd-credits">{credits}</div>
      {phase}
      <section className="gd-plan" aria-labelledby="gd-plan-title">
        <div className="gd-heading"><h2 id="gd-plan-title">Your day</h2><Link href="/schedule">Full schedule <ArrowRight size={16} aria-hidden /></Link></div>
        {items === null ? <p role="status">Loading the programme…</p> : error ? <div><p>We couldn’t load the programme.</p><button className="fh-btn fh-btn-ghost" onClick={retry}>Try again</button></div> : dayItems.length === 0 ? <><p className="gd-plan-title">The programme is on its way</p><p>Times and locations will appear here when published.</p></> : <><p className="gd-day">{day} programme preview</p><ol className="gd-agenda">{dayItems.slice(0, 1).map(item => <li key={item.id}><span>{!item.time_label || item.time_label.toUpperCase() === "TBD" ? "Time to be announced" : item.time_label}</span><b>{item.title}</b><small>{!item.location || item.location.toUpperCase() === "TBD" ? "Location to be announced" : item.location}</small></li>)}</ol></>}
        <Link href="/map" className="gd-primary"><MapPin size={20} aria-hidden />Explore the campus map<ArrowRight size={18} aria-hidden /></Link>
      </section>
      <section className="gd-progress" aria-labelledby="gd-progress-title">
        <div><h2 id="gd-progress-title">Your group</h2><p>Tokens collected together</p></div><Link href="/transactions" aria-label="View token history" className="gd-tokens">{loading ? "…" : group ? group.token_balance : "–"}<span>tokens <ArrowRight size={14} aria-hidden /></span></Link>
      </section>
      <nav className="gd-tools" aria-label="Group shortcuts">
        <Link href="/inventory"><Package size={22} aria-hidden /><span>Items<b>Your group’s collection</b></span><ArrowRight size={16} aria-hidden /></Link>
        <Link href="/faq"><HelpCircle size={22} aria-hidden /><span>Need help?<b>FAQ and contacts</b></span><ArrowRight size={16} aria-hidden /></Link>
        <Link href="/transactions"><History size={22} aria-hidden /><span>Token history<b>See what your group earned</b></span><ArrowRight size={16} aria-hidden /></Link>
        <Link href="/schedule"><CalendarDays size={22} aria-hidden /><span>Schedule<b>All event activities</b></span><ArrowRight size={16} aria-hidden /></Link>
      </nav>
    </main>
  );
}
