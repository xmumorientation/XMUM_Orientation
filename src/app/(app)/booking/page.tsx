"use client";

import { CalendarCheck, Clock, Plus, Users } from "lucide-react";
import { useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Button, Card, PageTitle, StatusPill } from "@/components/ui";

interface TimeSlot {
  id: string;
  time: string;
  interviewer: string;
  candidate: string | null;
  status: "open" | "booked" | "completed";
}

const INITIAL_SLOTS: TimeSlot[] = [
  { id: "1", time: "09:00 AM - 09:30 AM", interviewer: "Head of Facilitators", candidate: "Alex Tan", status: "booked" },
  { id: "2", time: "09:30 AM - 10:00 AM", interviewer: "Head of Facilitators", candidate: null, status: "open" },
  { id: "3", time: "10:00 AM - 10:30 AM", interviewer: "Head of Game Masters", candidate: "Sarah Lee", status: "booked" },
  { id: "4", time: "10:30 AM - 11:00 AM", interviewer: "Head of Game Masters", candidate: null, status: "open" },
];

export default function BookingPage() {
  const profile = useProfile();
  const [slots, setSlots] = useState<TimeSlot[]>(INITIAL_SLOTS);
  const [notice, setNotice] = useState<string | null>(null);

  function handleBook(id: string) {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, candidate: profile.full_name || "Current User", status: "booked" }
          : s
      )
    );
    setNotice("Time slot successfully booked!");
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Interview Time Slot Booking"
        subtitle="Degree Week 1 — HOF & HOGM interview selection portal"
        action={<StatusPill tone="info">Degree Week 1</StatusPill>}
      />

      {notice && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-900">
          {notice}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3 text-brand-1">
            <CalendarCheck size={20} />
            <span className="text-sm font-bold">Total Slots</span>
          </div>
          <p className="mt-2 text-3xl font-black">{slots.length}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3 text-green-600">
            <Clock size={20} />
            <span className="text-sm font-bold">Available Slots</span>
          </div>
          <p className="mt-2 text-3xl font-black">
            {slots.filter((s) => s.status === "open").length}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3 text-purple-600">
            <Users size={20} />
            <span className="text-sm font-bold">Booked Applicants</span>
          </div>
          <p className="mt-2 text-3xl font-black">
            {slots.filter((s) => s.status === "booked").length}
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Available Interview Slots</h2>
          {profile.role === "admin" && (
            <Button size="sm" icon={Plus}>
              Create New Slot
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot) => (
            <Card key={slot.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-bold text-ink">{slot.time}</p>
                <p className="text-xs text-ink-faint">Interviewer: {slot.interviewer}</p>
                {slot.candidate ? (
                  <p className="mt-1 text-xs font-semibold text-brand-1">
                    Booked by: {slot.candidate}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-green-600">Open for booking</p>
                )}
              </div>
              <div>
                {slot.status === "open" ? (
                  <Button size="sm" onClick={() => handleBook(slot.id)}>
                    Book Slot
                  </Button>
                ) : (
                  <StatusPill tone="neutral">Booked</StatusPill>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
