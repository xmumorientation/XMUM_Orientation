"use client";

import { QrCode, Search, UserCheck } from "lucide-react";
import { useState } from "react";

import { Button, Card, PageTitle, StatusPill } from "@/components/ui";

interface FreshieCheckin {
  studentId: string;
  name: string;
  assignedGroup: string;
  status: "pending" | "checked_in";
}

const MOCK_FRESHIES: FreshieCheckin[] = [
  { studentId: "SWE2309001", name: "David Yong", assignedGroup: "Group 1", status: "checked_in" },
  { studentId: "SWE2309002", name: "Jia Min", assignedGroup: "Group 2", status: "pending" },
  { studentId: "SWE2309003", name: "Yen Xin", assignedGroup: "Group 3", status: "pending" },
  { studentId: "SWE2309004", name: "Ben Lim", assignedGroup: "Group 1", status: "checked_in" },
];

export default function RegisterCounterPage() {
  const [search, setSearch] = useState("");
  const [list, setList] = useState<FreshieCheckin[]>(MOCK_FRESHIES);

  const filtered = list.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.studentId.toLowerCase().includes(search.toLowerCase())
  );

  function handleCheckin(studentId: string) {
    setList((prev) =>
      prev.map((f) => (f.studentId === studentId ? { ...f, status: "checked_in" } : f))
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Freshies Register Counter"
        subtitle="D-Day — Onboarding registration, student ID lookup & group number distribution"
        action={<StatusPill tone="warning">D-Day Live</StatusPill>}
      />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-ink-faint" size={18} />
            <input
              type="text"
              placeholder="Search by student ID or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <Button icon={QrCode} intent="secondary">
            Scan QR
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">Registration Roster</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => (
            <Card key={f.studentId} className="flex items-center justify-between p-4">
              <div>
                <p className="font-bold text-ink">{f.name}</p>
                <p className="text-xs text-ink-faint">ID: {f.studentId}</p>
                <span className="mt-1 inline-block rounded-md bg-brand-1/10 px-2 py-0.5 text-xs font-bold text-brand-1">
                  Assigned: {f.assignedGroup}
                </span>
              </div>

              <div>
                {f.status === "checked_in" ? (
                  <StatusPill tone="success">Checked In</StatusPill>
                ) : (
                  <Button size="sm" icon={UserCheck} onClick={() => handleCheckin(f.studentId)}>
                    Assign & Check-in
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
