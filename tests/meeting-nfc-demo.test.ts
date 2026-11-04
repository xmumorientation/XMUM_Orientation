import { describe, expect, it } from "vitest";
import { meetingDemoOpen } from "@/lib/meeting-nfc-demo";

describe("meeting NFC demo", () => {
  it("expires at midnight after the meeting in Malaysia", () => {
    expect(meetingDemoOpen(new Date("2026-11-05T15:59:59Z"))).toBe(true);
    expect(meetingDemoOpen(new Date("2026-11-05T16:00:00Z"))).toBe(false);
  });
});
