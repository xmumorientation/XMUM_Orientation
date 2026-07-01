import { NextResponse } from "next/server";

// FR-10.4: server clock authority — clients sync their offset from this.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ now: Date.now() });
}
