// Mock content for the NEXUS '26 homepage, adapted from the Figma Make
// prototype. This is display-only sample data — no backend is wired yet.

/** Font-family shorthands mapped to the scoped homepage font variables. */
export const FONT = {
  display: "var(--font-nexus-display), 'Space Grotesk', sans-serif",
  body: "var(--font-nexus-body), Inter, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', monospace",
} as const;

export type Team = {
  id: number;
  name: string;
  color: string;
  emoji: string;
  score: number;
  members: number;
  wins: number;
};

export const TEAMS: Team[] = [
  { id: 1, name: "Team Aquila", color: "#00cfff", emoji: "🦅", score: 4820, members: 24, wins: 7 },
  { id: 2, name: "Team Vega", color: "#d966ff", emoji: "⭐", score: 4650, members: 22, wins: 6 },
  { id: 3, name: "Team Orion", color: "#ff3cac", emoji: "🎯", score: 4430, members: 25, wins: 5 },
  { id: 4, name: "Team Lyra", color: "#39ff14", emoji: "🎵", score: 4180, members: 23, wins: 4 },
  { id: 5, name: "Team Pyxis", color: "#f9d342", emoji: "🧭", score: 3960, members: 21, wins: 4 },
  { id: 6, name: "Team Draco", color: "#ff6b35", emoji: "🐉", score: 3720, members: 24, wins: 3 },
];

export type Game = {
  id: number;
  name: string;
  status: "LIVE" | "UPCOMING" | "COMPLETED";
  type: string;
  points: number;
  players: number;
  desc: string;
  icon: string;
};

export const GAMES: Game[] = [
  { id: 1, name: "Campus Scavenger Hunt", status: "LIVE", type: "Field", points: 500, players: 142, desc: "Find 20 hidden QR codes across campus. First team to complete wins bonus points.", icon: "🗺️" },
  { id: 2, name: "Trivia Blitz", status: "UPCOMING", type: "Quiz", points: 300, players: 0, desc: "5-round trivia covering campus history, academic programs, and student life.", icon: "❓" },
  { id: 3, name: "Relay Race", status: "UPCOMING", type: "Physical", points: 400, players: 0, desc: "4-person relay across the main field. Each lap earns individual + team points.", icon: "🏃" },
  { id: 4, name: "Tower Build", status: "COMPLETED", type: "Creative", points: 350, players: 138, desc: "Build the tallest tower using spaghetti and marshmallows. Team Aquila won!", icon: "🏗️" },
];

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
  { id: "sports", name: "Sports Complex", x: 76, y: 64, icon: "⚽", color: "#39ff14", desc: "Football, basketball, badminton, swimming pool. Orientation relay held here." },
  { id: "med", name: "Medical Center", x: 22, y: 54, icon: "🏥", color: "#ff3cac", desc: "24-hour clinic. Free consultation for registered students." },
  { id: "dorm", name: "Student Dorms", x: 80, y: 28, icon: "🏠", color: "#ff6b35", desc: "Blocks D–H. Room assignments via student portal." },
  { id: "cs", name: "CS & Engineering", x: 43, y: 70, icon: "💻", color: "#7b2fff", desc: "Faculties of Computing and Engineering. Labs open 8am–10pm." },
  { id: "arts", name: "Arts & Social", x: 63, y: 38, icon: "🎨", color: "#ff3cac", desc: "Faculty of Arts, Humanities, and Social Sciences." },
];

export type EventItem = {
  time: string;
  title: string;
  venue: string;
  committee: string;
  type: "info" | "star" | "map" | "game" | "food";
};

export type EventDay = { day: string; date: string; items: EventItem[] };

export const EVENTS: EventDay[] = [
  { day: "Day 1", date: "Sep 18", items: [
    { time: "08:00", title: "Registration & Welcome Kit", venue: "Main Hall", committee: "Logistics", type: "info" },
    { time: "10:00", title: "Opening Ceremony", venue: "Auditorium", committee: "Program", type: "star" },
    { time: "13:00", title: "Campus Tour", venue: "Admin Courtyard", committee: "Welfare", type: "map" },
    { time: "16:00", title: "Team Formation & Cheers", venue: "Sports Field", committee: "Games", type: "game" },
    { time: "19:00", title: "Welcome Dinner", venue: "Main Canteen", committee: "Logistics", type: "food" },
  ]},
  { day: "Day 2", date: "Sep 19", items: [
    { time: "08:30", title: "Morning Assembly", venue: "Sports Field", committee: "Program", type: "star" },
    { time: "09:30", title: "Tower Build Challenge", venue: "Lecture Hall 3", committee: "Games", type: "game" },
    { time: "12:00", title: "Lunch Break", venue: "Main Canteen", committee: "Logistics", type: "food" },
    { time: "14:00", title: "Trivia Blitz", venue: "Auditorium", committee: "Games", type: "game" },
    { time: "16:30", title: "Faculty Info Sessions", venue: "Respective Faculties", committee: "Academic", type: "info" },
    { time: "19:30", title: "Night Carnival", venue: "Main Field", committee: "Entertainment", type: "star" },
  ]},
  { day: "Day 3", date: "Sep 20", items: [
    { time: "07:30", title: "Scavenger Hunt Briefing", venue: "Sports Field", committee: "Games", type: "game" },
    { time: "08:00", title: "Campus Scavenger Hunt", venue: "Full Campus", committee: "Games", type: "map" },
    { time: "12:30", title: "Relay Race", venue: "Sports Complex", committee: "Games", type: "game" },
    { time: "15:00", title: "Closing Ceremony & Awards", venue: "Auditorium", committee: "Program", type: "star" },
    { time: "17:00", title: "Group Photo", venue: "Main Courtyard", committee: "Media", type: "info" },
  ]},
];

export type Committee = {
  name: string;
  icon: string;
  color: string;
  head: string;
  members: number;
  desc: string;
  functions: string[];
};

export const COMMITTEES: Committee[] = [
  { name: "Games & Sports", icon: "🎮", color: "#00cfff", head: "Ahmad Razif", members: 18,
    desc: "Coordinates all competitive events, tracks scores, and ensures fair play across all orientation games.",
    functions: ["Score calculation", "Game facilitation", "Sports events", "Rule enforcement"] },
  { name: "Program", icon: "📋", color: "#d966ff", head: "Siti Nurhaliza", members: 12,
    desc: "Plans and executes all main stage events, ceremonies, and the overall orientation flow.",
    functions: ["Opening ceremony", "Closing ceremony", "Stage management", "MC coordination"] },
  { name: "Logistics", icon: "📦", color: "#f9d342", head: "Raj Kumar", members: 20,
    desc: "Handles all materials, registration, food distribution, and physical setup for every event.",
    functions: ["Registration booths", "Welcome kits", "Food & beverage", "Venue setup"] },
  { name: "Welfare", icon: "💚", color: "#39ff14", head: "Mei Ling", members: 14,
    desc: "Ensures student wellbeing, manages medical referrals, and provides emotional support throughout orientation.",
    functions: ["Medical liaison", "Campus tour guides", "Student support", "First aid"] },
  { name: "Entertainment", icon: "🎵", color: "#ff3cac", head: "Danial Hakim", members: 16,
    desc: "Delivers performances, activities, and social programs to build camaraderie among new students.",
    functions: ["Night events", "Performances", "Social mixers", "Crowd engagement"] },
  { name: "Media & Design", icon: "📸", color: "#ff6b35", head: "Priya Devi", members: 10,
    desc: "Documents the entire orientation, manages social media presence, and produces promotional materials.",
    functions: ["Photography", "Social media", "Video production", "Graphic design"] },
];

export type QuizQuestion = { q: string; opts: string[]; ans: number };

export const QUIZ: QuizQuestion[] = [
  { q: "What year was this university founded?", opts: ["1969", "1975", "1982", "1990"], ans: 1 },
  { q: "How many faculties does the university currently have?", opts: ["8", "10", "12", "15"], ans: 2 },
  { q: "What is the name of the main library?", opts: ["Perpustakaan Utama", "Library One", "Central Library", "Knowledge Hub"], ans: 2 },
  { q: "Which faculty is housed in the oldest building on campus?", opts: ["Engineering", "Arts & Social", "Law", "Medicine"], ans: 1 },
  { q: "How many student clubs are officially registered?", opts: ["48", "72", "96", "120"], ans: 3 },
];

import { resetScroll } from "@/components/park/scrollStore";

/**
 * Scrolls to a homepage section. "home" jumps to the very top of the page — the
 * top of the cinematic section — since the cinematic is the first section of one
 * continuous page.
 *
 * The jump is instant (not a long smooth-scroll across the whole page): a
 * multi-second smooth scroll back up would replay the entire camera flight in
 * reverse. Snapping the shared scroll store to 0 first keeps the camera pinned
 * at the establishing shot, so the one-time opening animation never restarts and
 * there is no jarring reverse fly-through.
 *
 * Other ids smooth-scroll to their section (short, in-content distances),
 * accounting for the fixed nav via each section's scrollMarginTop.
 */
export function scrollToSection(id: string) {
  if (id === "home") {
    resetScroll();
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}
