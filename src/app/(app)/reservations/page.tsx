"use client";

import { Calendar, Clock, MapPin, Plus } from "lucide-react";
import { useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Button, Card, PageTitle, StatusPill } from "@/components/ui";

interface PracticeSession {
  id: string;
  venue: string;
  timeSlot: string;
  groupName: string;
  bookedBy: string;
}

const INITIAL_SESSIONS: PracticeSession[] = [
  { id: "1", venue: "Main Auditorium A1", timeSlot: "02:00 PM - 04:00 PM", groupName: "Dance Team", bookedBy: "Committee" },
  { id: "2", venue: "B1 Multi-purpose Hall", timeSlot: "04:00 PM - 06:00 PM", groupName: "Group 3 Performance", bookedBy: "Facilitators" },
  { id: "3", venue: "A4 Activity Room", timeSlot: "07:00 PM - 09:00 PM", groupName: "GM Station Rehearsal", bookedBy: "Game Masters" },
];

export default function ReservationsPage() {
  const profile = useProfile();
  const [sessions, setSessions] = useState<PracticeSession[]>(INITIAL_SESSIONS);
  const [venue, setVenue] = useState("Main Auditorium A1");
  const [timeSlot, setTimeSlot] = useState("08:00 PM - 10:00 PM");
  const [groupName, setGroupName] = useState("");

  function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName) return;
    const newSession: PracticeSession = {
      id: String(Date.now()),
      venue,
      timeSlot,
      groupName,
      bookedBy: profile.full_name || profile.role,
    };
    setSessions((prev) => [newSession, ...prev]);
    setGroupName("");
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Performance Practice Group Reservation"
        subtitle="Degree Week 3 — Reserve practice halls for committee, facilitators & GMs"
        action={<StatusPill tone="info">Degree Week 3</StatusPill>}
      />

      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Reserve a Practice Slot</h2>
        <form onSubmit={handleReserve} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Venue</label>
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="input"
            >
              <option value="Main Auditorium A1">Main Auditorium A1</option>
              <option value="B1 Multi-purpose Hall">B1 Multi-purpose Hall</option>
              <option value="A4 Activity Room">A4 Activity Room</option>
              <option value="Courts Area">Courts Area</option>
            </select>
          </div>

          <div>
            <label className="label">Time Slot</label>
            <select
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="input"
            >
              <option value="02:00 PM - 04:00 PM">02:00 PM - 04:00 PM</option>
              <option value="04:00 PM - 06:00 PM">04:00 PM - 06:00 PM</option>
              <option value="07:00 PM - 09:00 PM">07:00 PM - 09:00 PM</option>
              <option value="08:00 PM - 10:00 PM">08:00 PM - 10:00 PM</option>
            </select>
          </div>

          <div>
            <label className="label">Group / Performance Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Group 5 Drama"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="input"
            />
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" icon={Plus} fullWidth>
              Confirm Practice Reservation
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">Scheduled Practice Reservations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-ink">{s.groupName}</p>
                <StatusPill tone="neutral">{s.bookedBy}</StatusPill>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
                <MapPin size={14} />
                <span>{s.venue}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
                <Clock size={14} />
                <span>{s.timeSlot}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
