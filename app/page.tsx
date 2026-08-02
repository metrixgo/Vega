"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

export type Status = "Safe" | "Needs help" | "Unchecked";

export type Student = {
  id: number;
  name: string;
  phone: string;
  status: Status;
  issue?: string;
  location: [number, number];
  lastSeen: string;
};

export type Notice = {
  id: number;
  text: string;
  time: string;
};

type EventApiResponse = {
  code: string;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  updatedAt: number;
};

const EventMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading live map…</div>,
});

const tone: Record<Status, string> = {
  Safe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Needs help": "bg-red-50 text-red-700 ring-red-200",
  Unchecked: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Logo() {
  return <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 font-bold text-white shadow-sm">V</div>;
}

function Badge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "Safe" ? "bg-emerald-500" : status === "Needs help" ? "bg-red-500" : "bg-slate-400"}`} />
      {status}
    </span>
  );
}

export default function App() {
  const [screen, setScreen] = useState<"home" | "create" | "join" | "organizer" | "participant">("home");
  const [code, setCode] = useState("VEGA-8492");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Real-time dynamic state (NO hardcoded demo data!)
  const [students, setStudents] = useState<Student[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [emergency, setEmergency] = useState<string | null>(null);
  const [participantStatus, setParticipantStatus] = useState<Status>("Unchecked");

  // Load session from localStorage
  useEffect(() => {
    const session = localStorage.getItem("vega-session");
    if (session) {
      try {
        const saved = JSON.parse(session);
        if (saved.code) setCode(saved.code);
        if (saved.name) setName(saved.name);
        if (saved.phone) setPhone(saved.phone);
        if (saved.role === "organizer") setScreen("organizer");
        else if (saved.role === "participant") setScreen("participant");
      } catch {
        /* Ignore invalid session */
      }
    }
  }, []);

  // Poll server for real-time updates across devices
  useEffect(() => {
    if (screen !== "organizer" && screen !== "participant") return;

    let isSubscribed = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/event?code=${encodeURIComponent(code)}`);
        if (!res.ok) return;
        const data: EventApiResponse = await res.json();
        if (isSubscribed) {
          setStudents(data.students || []);
          setNotices(data.notices || []);
          setEmergency(data.emergency);

          // Update current participant's status from server if on participant view
          if (screen === "participant" && name) {
            const me = (data.students || []).find((s) => s.name.toLowerCase() === name.toLowerCase() || (phone && s.phone === phone));
            if (me) {
              setParticipantStatus(me.status);
            }
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 2000); // poll every 2 seconds for real-time sync

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [screen, code, name, phone]);

  const saveSession = (role: "organizer" | "participant", updates: Record<string, unknown> = {}) => {
    localStorage.setItem("vega-session", JSON.stringify({ role, code, name, phone, ...updates }));
  };

  const leave = () => {
    localStorage.removeItem("vega-session");
    setStudents([]);
    setNotices([]);
    setEmergency(null);
    setScreen("home");
  };

  const create = async () => {
    const nextCode = `VEGA-${Math.floor(1000 + Math.random() * 9000)}`;
    setCode(nextCode);
    setStudents([]);
    setNotices([]);
    setEmergency(null);
    saveSession("organizer", { code: nextCode });

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", code: nextCode }),
      });
    } catch {
      /* fallback */
    }

    setScreen("organizer");
  };

  const join = async () => {
    if (!code.trim() || !name.trim() || !phone.trim()) return;
    saveSession("participant");

    // Attempt to get user GPS location
    let initialLocation: [number, number] = [37.7749, -122.4194];
    if (typeof window !== "undefined" && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
        });
        initialLocation = [pos.coords.latitude, pos.coords.longitude];
      } catch {
        /* Default location if permission denied */
      }
    }

    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code, name: name.trim(), phone: phone.trim(), location: initialLocation }),
      });
      if (res.ok) {
        const data: EventApiResponse = await res.json();
        setStudents(data.students);
        setNotices(data.notices);
      }
    } catch {
      /* fallback */
    }

    setScreen("participant");
  };

  if (screen === "home") return <Landing onCreate={() => setScreen("create")} onJoin={() => setScreen("join")} />;

  if (screen === "create")
    return (
      <Form title="Create an event" subtitle="Set up a real-time safety space for your group.">
        <button onClick={create} className="primary w-full min-h-[48px] text-base">
          Create event
        </button>
        <Back onClick={() => setScreen("home")} />
      </Form>
    );

  if (screen === "join")
    return (
      <Form title="Join an event" subtitle="Enter the details shared by your organizer to connect live.">
        <Input label="Event code" value={code} onChange={setCode} placeholder="VEGA-0000" />
        <Input label="Full name" value={name} onChange={setName} placeholder="Your full name" />
        <Input label="Emergency contact phone" value={phone} onChange={setPhone} placeholder="(000) 000-0000" />
        <button onClick={join} className="primary mt-2 w-full min-h-[48px] text-base">
          Join event & share location
        </button>
        <Back onClick={() => setScreen("home")} />
      </Form>
    );

  if (screen === "organizer")
    return (
      <Organizer
        code={code}
        students={students}
        notices={notices}
        emergency={emergency}
        sendNotice={async (text) => {
          try {
            const res = await fetch("/api/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "notice", code, text }),
            });
            if (res.ok) {
              const data = await res.json();
              setNotices(data.notices);
            }
          } catch {
            /* fallback */
          }
        }}
        setEmergency={async (text) => {
          setEmergency(text);
          try {
            await fetch("/api/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: text ? "emergency" : "clear_emergency", code, text }),
            });
          } catch {
            /* fallback */
          }
        }}
        markSafe={async (studentId) => {
          try {
            const res = await fetch("/api/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "mark_safe", code, studentId }),
            });
            if (res.ok) {
              const data = await res.json();
              setStudents(data.students);
            }
          } catch {
            /* fallback */
          }
        }}
        resetEvent={async () => {
          try {
            const res = await fetch("/api/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "reset", code }),
            });
            if (res.ok) {
              const data = await res.json();
              setStudents(data.students);
              setNotices(data.notices);
              setEmergency(data.emergency);
            }
          } catch {
            /* fallback */
          }
        }}
        leave={leave}
      />
    );

  return (
    <Participant
      code={code}
      name={name || "Guest"}
      phone={phone}
      status={participantStatus}
      updateStatus={async (nextStatus, issue, location) => {
        setParticipantStatus(nextStatus);
        try {
          const res = await fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_status", code, studentName: name, phone, status: nextStatus, issue, location }),
          });
          if (res.ok) {
            const data = await res.json();
            setStudents(data.students);
          }
        } catch {
          /* fallback */
        }
      }}
      updateLocation={async (location) => {
        try {
          const res = await fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_location", code, studentName: name, phone, location }),
          });
          if (res.ok) {
            const data = await res.json();
            setStudents(data.students);
          }
        } catch {
          /* fallback */
        }
      }}
      notices={notices}
      emergency={emergency}
      clearEmergency={async () => {
        setEmergency(null);
        setParticipantStatus("Safe");
        try {
          await fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_status", code, studentName: name, phone, status: "Safe" }),
          });
        } catch {
          /* fallback */
        }
      }}
      leave={leave}
    />
  );
}

function Landing({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <main className="min-h-screen p-5 md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center gap-3">
          <Logo />
          <span className="text-sm font-medium text-slate-500">Group safety, simple & real-time</span>
        </header>
        <section className="grid min-h-[80vh] items-center gap-12 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-slate-500">Real-Time Event Safety</p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">Stay connected across all devices.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Live location sharing, instant safety check-ins, and emergency broadcasting synced seamlessly between mobile phones and computers.
            </p>
          </div>
          <div className="space-y-4">
            <RoleCard title="I’m an organizer" text="Create a new event code, monitor real-time participant map, and broadcast alerts." action="Create event" onClick={onCreate} />
            <RoleCard title="I’m a participant" text="Join an existing event code, share your live GPS location, and check in safe." action="Join event" onClick={onJoin} />
          </div>
        </section>
      </div>
    </main>
  );
}

function RoleCard({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group w-full rounded-2xl bg-white p-6 text-left shadow-sm border border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-slate-900 underline underline-offset-4">{action}</span>
        </div>
        <span className="text-xl text-slate-400 group-hover:text-slate-900">→</span>
      </div>
    </button>
  );
}

function Form({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-3">
          <Logo />
          <span className="font-semibold text-slate-900">Vega Safety Manager</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 sm:p-7">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mb-7 mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="mb-4 block text-sm font-medium text-slate-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="field mt-2" />
    </label>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 w-full py-2 text-sm text-slate-500 hover:text-slate-800">
      Back
    </button>
  );
}

function Topbar({ code, type, leave }: { code: string; type: string; leave: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <div className="font-semibold text-slate-900">Vega Safety Manager</div>
          <div className="text-xs text-slate-500">{type} dashboard</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase font-bold text-slate-400">Share Code</span>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs font-bold text-slate-800">{code}</span>
        </div>
        <button onClick={leave} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          Leave event
        </button>
      </div>
    </header>
  );
}

function Organizer({
  code,
  students,
  notices,
  emergency,
  sendNotice,
  setEmergency,
  markSafe,
  resetEvent,
  leave,
}: {
  code: string;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  sendNotice: (text: string) => void;
  setEmergency: (text: string | null) => void;
  markSafe: (studentId: number) => void;
  resetEvent: () => void;
  leave: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "All">("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [alert, setAlert] = useState("Please go calmly to the designated assembly point.");
  const [showAlert, setShowAlert] = useState(false);

  const selected = useMemo(() => students.find((s) => s.id === selectedId) || students[0] || null, [students, selectedId]);

  const visible = useMemo(
    () => students.filter((student) => (filter === "All" || student.status === filter) && student.name.toLowerCase().includes(query.toLowerCase())),
    [students, query, filter]
  );

  const count = (status: Status) => students.filter((student) => student.status === status).length;

  return (
    <main className="min-h-screen pb-10">
      <Topbar code={code} type="Organizer" leave={leave} />
      <div className="mx-auto max-w-[1600px] p-4 md:p-7">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live Sync Active</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Group overview</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={resetEvent} className="secondary text-xs">
              Clear event data
            </button>
            <button onClick={() => setShowAlert(true)} className="danger text-sm">
              Declare emergency
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Participants Joined" value={students.length} />
          <Metric label="Safe" value={count("Safe")} color="text-emerald-600" />
          <Metric label="Need help" value={count("Needs help")} color="text-red-600" />
          <Metric label="Unchecked" value={count("Unchecked")} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 p-5">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-slate-900">Participants</h2>
                <span className="text-xs text-slate-500">{visible.length} registered</span>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search participants..."
                className="field mt-4 bg-slate-100"
              />
              <div className="mt-3 flex gap-2 overflow-auto">
                {(["All", "Safe", "Needs help", "Unchecked"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      filter === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[440px] overflow-auto min-h-[160px]">
              {visible.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  {students.length === 0 ? (
                    <div>
                      <p className="font-medium text-slate-600">No participants yet</p>
                      <p className="mt-1 text-xs text-slate-400">Have group members open the Vercel app on their phones and enter code:</p>
                      <div className="mt-3 inline-block rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-bold text-slate-800">{code}</div>
                    </div>
                  ) : (
                    "No participants match search criteria."
                  )}
                </div>
              ) : (
                visible.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedId(student.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left ${
                      selected?.id === student.id ? "bg-slate-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                      {student.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Seen {student.lastSeen}</p>
                    </div>
                    <Badge status={student.status} />
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900">Live Participant Map</h2>
                <p className="mt-1 text-xs text-slate-500">Real-time GPS locations from mobile devices</p>
              </div>
              <div className="h-[360px] sm:h-[430px]">
                <EventMap students={students} selected={selected} onSelect={(student) => setSelectedId(student.id)} />
              </div>
            </div>

            {selected ? (
              <aside className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Participant</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{selected.name}</h2>
                <div className="mt-3">
                  <Badge status={selected.status} />
                </div>
                <div className="mt-5 space-y-3 border-y border-slate-100 py-4 text-sm">
                  <p>
                    <span className="block text-xs text-slate-400">Phone number</span>
                    <span className="font-medium text-slate-800">{selected.phone || "Not provided"}</span>
                  </p>
                  <p>
                    <span className="block text-xs text-slate-400">GPS Location</span>
                    <span className="font-mono text-xs text-slate-600">
                      {selected.location[0].toFixed(4)}, {selected.location[1].toFixed(4)}
                    </span>
                  </p>
                  {selected.issue && (
                    <p>
                      <span className="block text-xs text-slate-400">Reported Issue</span>
                      <span className="font-semibold text-red-600">{selected.issue}</span>
                    </p>
                  )}
                </div>
                <button onClick={() => markSafe(selected.id)} className="secondary mt-5 w-full">
                  Mark safe
                </button>
              </aside>
            ) : (
              <aside className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 grid place-items-center text-center">
                <p className="text-sm text-slate-400">Select a participant to view contact details & actions.</p>
              </aside>
            )}
          </section>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-900">Broadcast announcement</h2>
            <p className="text-xs text-slate-400 mt-1">Pushes immediately to all participant mobile screens</p>
            <textarea
              value={notice}
              onChange={(event) => setNotice(event.target.value)}
              placeholder="Write an update for your group…"
              className="field mt-3 min-h-24 resize-none"
            />
            <button
              onClick={() => {
                if (notice.trim()) {
                  sendNotice(notice.trim());
                  setNotice("");
                }
              }}
              className="primary mt-3"
            >
              Send announcement
            </button>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-900">Recent announcements</h2>
            <div className="mt-4 space-y-3">
              {notices.length === 0 ? (
                <p className="text-sm text-slate-400 py-4">No announcements broadcast yet.</p>
              ) : (
                notices.slice(0, 5).map((item) => (
                  <article key={item.id} className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                    <p className="text-sm text-slate-800">{item.text}</p>
                    <p className="mt-2 text-xs text-slate-400">{item.time}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {showAlert && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-red-600">HIGH PRIORITY ALERT</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Declare an emergency?</h2>
            <p className="mt-1 text-xs text-slate-500">This will immediately block participant screens with a full-screen red emergency alert.</p>
            <textarea value={alert} onChange={(event) => setAlert(event.target.value)} className="field mt-4 min-h-24 resize-none" />
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowAlert(false)} className="secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => {
                  setEmergency(alert);
                  setShowAlert(false);
                }}
                className="danger flex-1"
              >
                Send alert
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, color = "" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Participant({
  code,
  name,
  phone,
  status,
  updateStatus,
  updateLocation,
  notices,
  emergency,
  clearEmergency,
  leave,
}: {
  code: string;
  name: string;
  phone: string;
  status: Status;
  updateStatus: (status: Status, issue?: string, location?: [number, number]) => void;
  updateLocation: (location: [number, number]) => void;
  notices: Notice[];
  emergency: string | null;
  clearEmergency: () => void;
  leave: () => void;
}) {
  const [locationText, setLocationText] = useState("Location not shared yet");
  const [report, setReport] = useState<string | null>(null);

  const locate = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return setLocationText("Location is unavailable in this browser");
    }
    setLocationText("Finding your GPS location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLocationText(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · just now`);
        updateLocation(coords);
      },
      () => setLocationText("Location permission was not granted"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const needHelp = (issue: string) => {
    setReport(issue);
    updateStatus("Needs help", issue);
  };

  return (
    <main className="min-h-screen pb-10">
      <Topbar code={code} type="Participant" leave={leave} />
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-slate-500">Hello, {name.split(" ")[0]}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Your safety check-in</h1>
          </div>
          <Badge status={status} />
        </div>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-medium text-slate-600">Current status</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">
                {status === "Safe" ? "You’re marked safe" : status === "Needs help" ? "You need assistance" : "We haven’t heard from you"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Your organizer sees your updates in real time.</p>
            </div>
            <button
              onClick={() => {
                setReport(null);
                updateStatus("Safe");
              }}
              className="primary bg-emerald-600 hover:bg-emerald-700 min-h-[48px] px-6 text-base"
            >
              I AM SAFE
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Share your location</h2>
              <p className="mt-1 text-sm text-slate-500">{locationText}</p>
            </div>
            <button onClick={locate} className="secondary min-h-[44px]">
              Update GPS location
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Need help?</h2>
          <p className="text-xs text-slate-400 mt-1">Select an emergency category to alert the organizer immediately</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["Fire", "Injury", "Lost", "Hazard"].map((issue) => (
              <button
                key={issue}
                onClick={() => needHelp(issue)}
                className={`rounded-xl border p-4 text-sm font-semibold min-h-[56px] transition ${
                  report === issue ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 hover:border-slate-400 text-slate-800"
                }`}
              >
                {issue}
              </button>
            ))}
          </div>
          {report && <p className="mt-4 text-sm font-medium text-red-600">Your {report.toLowerCase()} report has been shared with the organizer.</p>}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Alerts & announcements</h2>
          <div className="mt-4 space-y-3">
            {notices.length === 0 ? (
              <p className="text-sm text-slate-400 py-3">No announcements from organizer yet.</p>
            ) : (
              notices.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                  <p className="text-sm leading-6 text-slate-800">{item.text}</p>
                  <p className="mt-2 text-xs text-slate-400">Organizer · {item.time}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {emergency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-600 p-5 text-center text-white">
          <div className="max-w-lg">
            <p className="text-sm font-bold uppercase tracking-[.2em] text-red-100">Emergency alert</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">Take action now</h2>
            <p className="mt-5 text-lg leading-8 text-red-50">{emergency}</p>
            <button onClick={clearEmergency} className="mt-10 w-full rounded-xl bg-white px-6 py-4 font-bold text-red-700 shadow-xl min-h-[56px] text-lg">
              I AM SAFE
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
