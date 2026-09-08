import { NextResponse } from "next/server";
import {
  fetchGameConfigRules,
  fetchPuzzleInventory,
  fetchStations,
  fetchTokenGroups,
  fetchTokenLogs,
  manualTokenAdjust,
  recordDay1Result,
  deductDay2Entry,
  awardDay2PuzzlePiece,
  updateGameConfigRule,
  resetAllTokensAndPuzzles,
  updateTokenLog,
  deleteTokenLog,
} from "@/lib/token-api";
import { requirePermission } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requirePermission("token.view");
  if (!auth) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const groupId = searchParams.get("groupId") ? Number(searchParams.get("groupId")) : undefined;

  try {
    if (type === "groups") {
      const groups = await fetchTokenGroups();
      return NextResponse.json({ ok: true, data: groups });
    }
    if (type === "rules") {
      const rules = await fetchGameConfigRules();
      return NextResponse.json({ ok: true, data: rules });
    }
    if (type === "logs") {
      const logs = await fetchTokenLogs(groupId);
      return NextResponse.json({ ok: true, data: logs });
    }
    if (type === "puzzle_inventory") {
      const inv = await fetchPuzzleInventory(groupId);
      return NextResponse.json({ ok: true, data: inv });
    }
    if (type === "stations") {
      const stations = await fetchStations();
      return NextResponse.json({ ok: true, data: stations });
    }

    // Default: Return full dashboard payload
    const [groups, rules, logs, inv, stations] = await Promise.all([
      fetchTokenGroups(),
      fetchGameConfigRules(),
      fetchTokenLogs(),
      fetchPuzzleInventory(),
      fetchStations(),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        groups,
        rules,
        logs,
        inventory: inv,
        stations,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "Failed to fetch token data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const permission = ["day1_record", "day2_deduct", "day2_award_piece"].includes(action)
      ? "token.play" as const
      : "token.manage" as const;
    const auth = await requirePermission(permission);
    if (!auth) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    if (action === "day1_record") {
      const res = await recordDay1Result(body);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "day2_deduct") {
      const res = await deductDay2Entry(body);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "day2_award_piece") {
      const res = await awardDay2PuzzlePiece(body);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "manual_adjust") {
      const res = await manualTokenAdjust(body);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "update_rule") {
      const { ruleKey, ruleValue } = body;
      const res = await updateGameConfigRule(ruleKey, ruleValue);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "edit_log") {
      const res = await updateTokenLog(body);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "delete_log") {
      const res = await deleteTokenLog(body.logId);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "reset_all") {
      const res = await resetAllTokensAndPuzzles();
      return NextResponse.json(res);
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "Request failed" }, { status: 500 });
  }
}
