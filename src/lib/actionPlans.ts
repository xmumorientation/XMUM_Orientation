/** Action plans shown on Home for every role except Freshie (see ActionPlan.tsx).
 *
 *  To change a plan, replace the file in public/action-plans/ with the real one.
 *  Keep the same name and extension and nothing else needs to change. To use a
 *  PDF instead of an image, drop in e.g. day-1.pdf and change `file` below. The
 *  card tells a PDF from an image by the extension (.pdf, .png, .jpg, .jpeg, .webp). */
export type ActionPlan = {
  id: string;
  title: string;
  subtitle: string;
  file: string;
};

export const ACTION_PLANS: readonly ActionPlan[] = [
  { id: "day-1", title: "Day 1 Action Plan", subtitle: "Crew timeline for the first day", file: "/action-plans/day-1.png" },
  { id: "day-2", title: "Day 2 Action Plan", subtitle: "Crew timeline for the second day", file: "/action-plans/day-2.png" },
];

export function isPdf(file: string): boolean {
  return file.toLowerCase().split("?")[0].endsWith(".pdf");
}
