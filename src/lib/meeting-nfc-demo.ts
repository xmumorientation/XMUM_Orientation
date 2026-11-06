/** This isolated meeting demo expires at midnight, 6 November, Malaysia time. */
export function meetingDemoOpen(now = new Date()): boolean {
  return now.getTime() < Date.parse("2026-11-05T16:00:00Z");
}
