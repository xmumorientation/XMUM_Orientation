// Centralized constants and placeholder data for the Vortexa homepage.
// Items marked PLACEHOLDER should be replaced with real Supabase queries
// once the backend data is available.

// ---------------------------------------------------------------------------
// Event identity
// ---------------------------------------------------------------------------

export const EVENT = {
  name: "XMUM Orientation 2026",
  theme: "Vortexa",
  slogan: "One ticket, One Ride, Discover adventure Inside.",
  dates: { day1: "2026-11-28T08:00:00+08:00", day2: "2026-11-29T08:00:00+08:00" },
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/** Font-family shorthands mapped to the scoped homepage font variables. */
export const FONT = {
  /** Brand title face (Brasika stand-in). */
  brand: "var(--font-vx-display), Georgia, serif",
  /** Section headings and big numbers (Karimun stand-in). */
  slab: "var(--font-vx-slab), Georgia, serif",
  display: "var(--font-nexus-display), 'Exo 2', sans-serif",
  body: "var(--font-nexus-body), Outfit, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', monospace",
} as const;

// ---------------------------------------------------------------------------
// Teams — PLACEHOLDER
// ---------------------------------------------------------------------------

export type Team = {
  id: number;
  name: string;
  color: string;
  /** null = event hasn't started yet, no scores available. */
  score: number | null;
  /** null = team roster not finalised yet. */
  members: number | null;
};

/** PLACEHOLDER — team names and colours are sample data. */
export const TEAMS: Team[] = [
  { id: 1, name: "Team Aquila", color: "#00cfff", score: null, members: null },
  { id: 2, name: "Team Vega", color: "#d966ff", score: null, members: null },
  { id: 3, name: "Team Orion", color: "#ff3cac", score: null, members: null },
  { id: 4, name: "Team Lyra", color: "#39ff14", score: null, members: null },
  { id: 5, name: "Team Pyxis", color: "#f9d342", score: null, members: null },
  { id: 6, name: "Team Draco", color: "#ff6b35", score: null, members: null },
];

// ---------------------------------------------------------------------------
// Game phases — conceptual flow shown on the homepage
// ---------------------------------------------------------------------------

export type GamePhase = {
  phase: string;
  label: string;
  desc: string;
  /** Lucide icon component name (e.g. "Compass") */
  icon: string;
};

export const GAME_PHASES: GamePhase[] = [
  { phase: "EXPLORE", label: "Explore", desc: "Discover game stations across campus", icon: "Compass" },
  { phase: "PLAY", label: "Play", desc: "Complete challenges at each station", icon: "Gamepad2" },
  { phase: "EARN", label: "Earn", desc: "Collect tokens and puzzle pieces", icon: "Coins" },
  { phase: "COMPETE", label: "Compete", desc: "Rise on the team leaderboard", icon: "Trophy" },
];

// ---------------------------------------------------------------------------
// Campus buildings — kept for the authenticated campus map section
// ---------------------------------------------------------------------------

export type Building = {
  id: string;
  name: string;
  x: number;
  y: number;
  icon: string;
  color: string;
  desc: string;
};

export const BUILDINGS: Building[] = [
  { id: "lib", name: "Central Library", x: 48, y: 30, icon: "📚", color: "#00cfff", desc: "Open 7am–midnight. Study rooms, printing, and digital resources available." },
  { id: "admin", name: "Admin Office", x: 30, y: 22, icon: "🏛️", color: "#d966ff", desc: "Registration, enrollment, and student records. Ground floor, Block A." },
  { id: "canteen", name: "Main Canteen", x: 55, y: 56, icon: "🍜", color: "#f9d342", desc: "3 food courts, open 6am–10pm. Cashless payments accepted." },
  { id: "sports", name: "Sports Complex", x: 76, y: 64, icon: "⚽", color: "#39ff14", desc: "Football, basketball, badminton, swimming pool." },
  { id: "med", name: "Medical Center", x: 22, y: 54, icon: "🏥", color: "#ff3cac", desc: "24-hour clinic. Free consultation for registered students." },
  { id: "dorm", name: "Student Dorms", x: 80, y: 28, icon: "🏠", color: "#ff6b35", desc: "Blocks D–H. Room assignments via student portal." },
  { id: "cs", name: "CS & Engineering", x: 43, y: 70, icon: "💻", color: "#7b2fff", desc: "Faculties of Computing and Engineering. Labs open 8am–10pm." },
  { id: "arts", name: "Arts & Social", x: 63, y: 38, icon: "🎨", color: "#ff3cac", desc: "Faculty of Arts, Humanities, and Social Sciences." },
];

// ---------------------------------------------------------------------------
// Schedule — PLACEHOLDER (2 days: 28–29 Nov 2026)
// ---------------------------------------------------------------------------

export type EventItem = {
  time: string;
  title: string;
  venue: string;
  type: "info" | "star" | "game" | "food";
};

export type EventDay = { day: string; date: string; items: EventItem[] };

/** PLACEHOLDER — specific times, venues, and activities TBD. */
export const EVENTS: EventDay[] = [
  {
    day: "Day 1",
    date: "28 Nov",
    items: [
      { time: "TBD", title: "Registration & Check-in", venue: "TBD", type: "info" },
      { time: "TBD", title: "Opening Ceremony", venue: "TBD", type: "star" },
      { time: "TBD", title: "Ice-Breaking Activities", venue: "TBD", type: "game" },
      { time: "TBD", title: "Team Formation & Briefing", venue: "TBD", type: "game" },
      { time: "TBD", title: "Dinner", venue: "TBD", type: "food" },
    ],
  },
  {
    day: "Day 2",
    date: "29 Nov",
    items: [
      { time: "TBD", title: "Morning Assembly", venue: "TBD", type: "star" },
      { time: "TBD", title: "Game Stations Begin", venue: "TBD", type: "game" },
      { time: "TBD", title: "Lunch Break", venue: "TBD", type: "food" },
      { time: "TBD", title: "Final Challenge", venue: "TBD", type: "game" },
      { time: "TBD", title: "Closing Ceremony & Awards", venue: "TBD", type: "star" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Committees — the 10 real Vortexa orientation committees
// ---------------------------------------------------------------------------

export type Committee = {
  id: string;
  name: string;
  fullName: string;
  /** Lucide icon component name (e.g. "Code") */
  icon: string;
  color: string;
  /** null = TBD, head has not been announced. */
  head: string | null;
  /** null = TBD, roster not finalised. */
  members: number | null;
  desc: string;
};

export const COMMITTEES: Committee[] = [
  { id: "tech", name: "Tech", fullName: "Technology & Development", icon: "Code", color: "#12e6ff", head: null, members: null, desc: "Builds and maintains the Vortexa digital platform, game systems, and technical infrastructure." },
  { id: "ep", name: "EP", fullName: "Event Planning", icon: "Calendar", color: "#a437ff", head: null, members: null, desc: "Plans and coordinates the overall event flow, ceremonies, and programme scheduling." },
  { id: "ga", name: "GA", fullName: "General Affairs", icon: "Briefcase", color: "#f9d342", head: null, members: null, desc: "Handles logistics, materials, venue setup, food, and all operational support." },
  { id: "hof", name: "HOF", fullName: "Head of Facilitators", icon: "Users", color: "#39ff14", head: null, members: null, desc: "Leads and coordinates all facilitators who guide freshies throughout the orientation." },
  { id: "hogm", name: "HOGM", fullName: "Head of Game Masters", icon: "Gamepad2", color: "#ff2e8b", head: null, members: null, desc: "Oversees all game stations, challenges, and the competitive game experience." },
  { id: "pr", name: "PR", fullName: "Public Relations", icon: "Megaphone", color: "#ff6b35", head: null, members: null, desc: "Manages external communications, social media presence, and promotional campaigns." },
  { id: "trea", name: "Trea", fullName: "Treasury", icon: "Wallet", color: "#ffb454", head: null, members: null, desc: "Manages the orientation budget, sponsorships, and financial planning." },
  { id: "sec", name: "Sec", fullName: "Secretary", icon: "FileText", color: "#d966ff", head: null, members: null, desc: "Handles documentation, meeting records, and internal communications." },
  { id: "design", name: "Design", fullName: "Design & Multimedia", icon: "Palette", color: "#ff3cac", head: null, members: null, desc: "Creates the visual identity, promotional materials, and multimedia content for Vortexa." },
  { id: "pgvg", name: "PGVG", fullName: "Photography & Videography", icon: "Camera", color: "#00cfff", head: null, members: null, desc: "Documents the orientation through photography, videography, and live coverage." },
];

// ---------------------------------------------------------------------------
// Scroll navigation
// ---------------------------------------------------------------------------

/** The homepage "ride stops", in scroll order. Each id is a section element id. */
export const STOPS = [
  { id: "welcome", label: "Welcome" },
  { id: "overview", label: "Overview" },
  { id: "games", label: "Games" },
  { id: "scoreboard", label: "Scoreboard" },
  { id: "schedule", label: "Schedule" },
  { id: "committees", label: "Committees" },
  { id: "join", label: "Join" },
] as const;

export type StopId = (typeof STOPS)[number]["id"];

/** Scrolls to a homepage section. "home" is an alias for the first stop. */
export function scrollToSection(id: string) {
  const target = id === "home" ? "welcome" : id;
  const el = document.getElementById(target);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (el) {
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}
