"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addJoinedEventToUser, addOrganizedEventToUser, getCurrentUser, logoutUser, removeOrganizedEventFromUser, User } from "@/lib/auth";
import type { EventData } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // Join Event Modal State
  const [newJoinCode, setNewJoinCode] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantPhone, setParticipantPhone] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create Event Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventCategory, setEventCategory] = useState("Camp");
  const [maxCapacity, setMaxCapacity] = useState(20);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push("/");
    } else {
      setUser(current);
      if (current.name) setParticipantName(current.name);
    }
  }, [router]);

  const handleLogout = () => {
    logoutUser();
    router.push("/");
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Generate a simple 4-digit numerical code (e.g., 8492)
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    const newEvent: EventData = {
      code,
      name: eventName.trim() || "Group Safety Event",
      description: eventDesc.trim(),
      category: eventCategory,
      maxParticipants: Number(maxCapacity) || 20,
      students: [],
      notices: [],
      messages: [],
      emergency: null,
      checkInRequest: null,
      deleted: false,
      updatedAt: Date.now(),
    };

    // Cache locally immediately before server POST to ensure millisecond 0 availability
    if (typeof window !== "undefined") {
      localStorage.setItem(`vega_cache_event_${code}`, JSON.stringify(newEvent));
    }

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          code,
          name: newEvent.name,
          description: newEvent.description,
          category: newEvent.category,
          maxParticipants: newEvent.maxParticipants,
        }),
      });
    } catch {
      /* ignore */
    }

    addOrganizedEventToUser(code);
    const updated = getCurrentUser();
    setUser(updated);
    setShowCreateModal(false);

    router.push(`/organizer/event/${code}`);
  };

  const handleJoinEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (!newJoinCode.trim() || !user) return;
    const code = newJoinCode.trim();

    try {
      // Validate code & capacity
      const checkRes = await fetch(`/api/event?code=${encodeURIComponent(code)}`);
      if (!checkRes.ok) {
        const errData = await checkRes.json();
        setJoinError(errData.error || "Invalid 4-digit Event Code. Event does not exist.");
        return;
      }

      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code,
          name: participantName || user.name,
          phone: participantPhone,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setJoinError(errData.error || "Failed to join event.");
        return;
      }

      addJoinedEventToUser(code);
      const updated = getCurrentUser();
      setUser(updated);
      setShowJoinModal(false);

      router.push(`/participant/event/${code}?name=${encodeURIComponent(participantName || user.name)}&phone=${encodeURIComponent(participantPhone)}`);
    } catch {
      setJoinError("Network error. Please try again.");
    }
  };

  const handleDeleteEvent = async (code: string) => {
    if (!confirm(`Are you sure you want to permanently delete event code ${code}? This action cannot be undone.`)) return;

    if (typeof window !== "undefined") {
      localStorage.removeItem(`vega_cache_event_${code}`);
    }

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", code }),
      });
    } catch {
      /* ignore */
    }

    removeOrganizedEventFromUser(code);
    const updated = getCurrentUser();
    setUser(updated);
  };

  if (!user) return <div className="p-10 text-center text-slate-500">Loading user account…</div>;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900 shadow-sm">
              <Image src="/images/logo.png" alt="Vega Logo" fill className="object-cover" />
            </Link>
            <div>
              <span className="font-bold text-slate-900 text-lg">Vega Safety Dashboard</span>
              <span className="block text-xs text-slate-500">Logged in as {user.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="secondary text-sm">
              Sign Out
            </button>
          </div>
        </header>

        {/* Welcome Section */}
        <section className="mt-8 rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Overview</span>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back, {user.name}!</h1>
              <p className="mt-1 text-sm text-slate-500">Manage all your organized safety events and joined groups from here.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setEventName("");
                  setEventDesc("");
                  setShowCreateModal(true);
                }}
                className="primary px-5 py-3 text-sm font-semibold shadow-sm"
              >
                + Create New Event
              </button>
              <button
                onClick={() => {
                  setJoinError(null);
                  setNewJoinCode("");
                  setShowJoinModal(true);
                }}
                className="secondary px-5 py-3 text-sm font-semibold"
              >
                Join Event with 4-Digit Code
              </button>
            </div>
          </div>
        </section>

        {/* Organized Events Section */}
        <section className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-900">Events I'm Organizing</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              {user.organizedEvents.length} persistent events
            </span>
          </div>

          {user.organizedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold text-slate-700">No organized events yet</p>
              <p className="mt-1 text-xs text-slate-500">Events you create generate a 4-digit code and persist until you manually delete them.</p>
              <button
                onClick={() => {
                  setEventName("");
                  setShowCreateModal(true);
                }}
                className="primary mt-4 text-xs font-semibold px-4 py-2"
              >
                Create First Event
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {user.organizedEvents.map((code) => (
                <div key={code} className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Join Code</span>
                        <span className="rounded-lg bg-slate-900 text-white px-3 py-1 font-mono text-base font-extrabold tracking-widest">{code}</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded ring-1 ring-emerald-200">
                        Organizer
                      </span>
                    </div>
                    <h3 className="mt-3 font-semibold text-slate-900 text-base">Group Safety Control Room</h3>
                    <p className="mt-1 text-xs text-slate-500">Real-time live map & status check-in center</p>
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <Link href={`/organizer/event/${code}`} className="primary text-xs font-semibold px-3 py-2 text-center flex-1">
                      Open Monitor →
                    </Link>
                    <button
                      onClick={() => handleDeleteEvent(code)}
                      className="danger text-xs font-semibold px-3 py-2 text-center"
                      title="Permanently delete event"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Joined Events Section */}
        <section className="mt-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-900">Events I've Joined</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              {user.joinedEvents.length} joined events
            </span>
          </div>

          {user.joinedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold text-slate-700">No joined events yet</p>
              <p className="mt-1 text-xs text-slate-500">Enter a 4-digit code shared by your organizer to join their safety check-in room.</p>
              <button
                onClick={() => {
                  setJoinError(null);
                  setShowJoinModal(true);
                }}
                className="secondary mt-4 text-xs font-semibold px-4 py-2"
              >
                Join Event with Code
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {user.joinedEvents.map((code) => (
                <div key={code} className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Event Code</span>
                        <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-bold text-slate-800 tracking-wider">{code}</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded ring-1 ring-blue-200">
                        Participant
                      </span>
                    </div>
                    <h3 className="mt-3 font-semibold text-slate-900 text-base">Check-In Space</h3>
                    <p className="mt-1 text-xs text-slate-500">Share GPS location & receive broadcast updates</p>
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <Link
                      href={`/participant/event/${code}?name=${encodeURIComponent(user.name)}`}
                      className="secondary w-full text-xs font-semibold py-2 block text-center"
                    >
                      Open Participant Check-In →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Create New Event</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Event Name</label>
                <input
                  type="text"
                  required
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., Summer Camp 2026 / SF Hackathon"
                  className="field mt-1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Category</label>
                <select value={eventCategory} onChange={(e) => setEventCategory(e.target.value)} className="field mt-1.5 bg-white">
                  <option value="Camp">Camp / Retreat</option>
                  <option value="Hackathon">Hackathon / Conference</option>
                  <option value="Field Trip">Field Trip / Tour</option>
                  <option value="Outdoor Excursion">Outdoor Excursion / Hiking</option>
                  <option value="General">General Event</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Description (Optional)</label>
                <textarea
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  placeholder="Brief details about location, meeting point, or schedule…"
                  className="field mt-1.5 min-h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Max Participant Capacity</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={200}
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(Number(e.target.value))}
                  className="field mt-1.5"
                />
              </div>

              <button type="submit" className="primary w-full py-3 mt-2 font-semibold">
                Generate 4-Digit Code & Launch
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Validate & Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Join Event with 4-Digit Code</h2>
              <button onClick={() => setShowJoinModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {joinError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">4-Digit Event Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={newJoinCode}
                  onChange={(e) => setNewJoinCode(e.target.value)}
                  placeholder="e.g. 8492"
                  className="field mt-1.5 font-mono text-lg font-bold text-center tracking-widest uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Your Name"
                  className="field mt-1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Emergency Contact Phone</label>
                <input
                  type="tel"
                  value={participantPhone}
                  onChange={(e) => setParticipantPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="field mt-1.5"
                />
              </div>

              <button type="submit" className="primary w-full py-3 mt-2 font-semibold">
                Validate Code & Join Space
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
