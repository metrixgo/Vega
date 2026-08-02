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

type StoredState = {
  students: Student[];
  notices: Notice[];
  emergency: string | null;
};

const initialStudents: Student[] = [
  { id: 1, name: "Amelia Chen", phone: "+1 (415) 555-0134", status: "Safe", location: [37.7749, -122.4194], lastSeen: "Just now" },
  { id: 2, name: "Noah Williams", phone: "+1 (415) 555-0179", status: "Needs help", issue: "Lost near the south entrance", location: [37.7769, -122.416], lastSeen: "2 min ago" },
  { id: 3, name: "Sofia Martinez", phone: "+1 (415) 555-0127", status: "Unchecked", location: [37.7728, -122.421], lastSeen: "18 min ago" },
  { id: 4, name: "Ethan Park", phone: "+1 (415) 555-0192", status: "Safe", location: [37.7791, -122.423], lastSeen: "5 min ago" },
];

const initialNotices: Notice[] = [
  { id: 1, text: "Welcome everyone. Please keep your phone available and check in when you arrive.", time: "10:15 AM" },
];

const EventMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>,
});

const tone: Record<Status, string> = {
  Safe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Needs help": "bg-red-50 text-red-700 ring-red-200",
  Unchecked: "bg-slate-100 text-slate-600 ring-slate-200",
};

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

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
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [emergency, setEmergency] = useState<string | null>(null);
  const [participantStatus, setParticipantStatus] = useState<Status>("Unchecked");

  useEffect(() => {
    const session = localStorage.getItem("vega-session");
    const data = localStorage.getItem("vega-demo-state");
    if (data) {
      try {
        const saved: StoredState = JSON.parse(data);
        setStudents(saved.students);
        setNotices(saved.notices);
        setEmergency(saved.emergency);
      } catch {
        /* Start fresh when saved data is invalid. */
      }
    }
    if (session) {
      try {
        const saved = JSON.parse(session);
        setCode(saved.code || "VEGA-8492");
        setName(saved.name || "");
        setPhone(saved.phone || "");
        setScreen(saved.role === "organizer" ? "organizer" : saved.role === "participant" ? "participant" : "home");
        setParticipantStatus(saved.status || "Unchecked");
      } catch {
        /* Ignore an invalid session. */
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("vega-demo-state", JSON.stringify({ students, notices, emergency }));
  }, [students, notices, emergency]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "vega-demo-state" && event.newValue) {
        const saved: StoredState = JSON.parse(event.newValue);
        setStudents(saved.students);
        setNotices(saved.notices);
        setEmergency(saved.emergency);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const saveSession = (role: "organizer" | "participant", updates: Record<string, unknown> = {}) =>
    localStorage.setItem("vega-session", JSON.stringify({ role, code, name, phone, status: participantStatus, ...updates }));

  const leave = () => {
    localStorage.removeItem("vega-session");
    setScreen("home");
  };

  const create = () => {
    const nextCode = `VEGA-${Math.floor(1000 + Math.random() * 9000)}`;
    setCode(nextCode);
    saveSession("organizer", { code: nextCode });
    setScreen("organizer");
  };

  const join = () => {
    if (!code.trim() || !name.trim() || !phone.trim()) return;
    saveSession("participant");
    setScreen("participant");
  };

  if (screen === "home") return <Landing onCreate={() => setScreen("create")} onJoin={() => setScreen("join")} />;
  if (screen === "create")
    return (
      <Form title="Create an event" subtitle="Set up a shared safety space for your group.">
        <button onClick={create} className="primary w-full">
          Create event
        </button>
        <Back onClick={() => setScreen("home")} />
      </Form>
    );
  if (screen === "join")
    return (
      <Form title="Join an event" subtitle="Enter the details shared by your organizer.">
        <Input label="Event code" value={code} onChange={setCode} placeholder="VEGA-0000" />
        <Input label="Full name" value={name} onChange={setName} placeholder="Your full name" />
        <Input label="Emergency contact phone" value={phone} onChange={setPhone} placeholder="(000) 000-0000" />
        <button onClick={join} className="primary mt-2 w-full">
          Join event
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
        setStudents={setStudents}
        sendNotice={(text) => setNotices((all) => [{ id: Date.now(), text, time: timeNow() }, ...all])}
        setEmergency={setEmergency}
        leave={leave}
      />
    );
  return (
    <Participant
      code={code}
      name={name || "Guest"}
      status={participantStatus}
      setStatus={(next) => {
        setParticipantStatus(next);
        saveSession("participant", { status: next });
      }}
      notices={notices}
      emergency={emergency}
      clearEmergency={() => {
        setEmergency(null);
        setParticipantStatus("Safe");
        saveSession("participant", { status: "Safe" });
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
          <span className="text-sm text-slate-500">Group safety, simply managed</span>
        </header>
        <section className="grid min-h-[80vh] items-center gap-12 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-slate-500">Event safety coordination</p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">Stay connected when it matters.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              A shared view of your group’s wellbeing for trips, events, and busy days out.
            </p>
          </div>
          <div className="space-y-4">
            <RoleCard title="I’m an organizer" text="Create an event, monitor your group, and send updates." action="Create event" onClick={onCreate} />
            <RoleCard title="I’m a participant" text="Check in, share your location, and receive important alerts." action="Join event" onClick={onJoin} />
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
        <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-600">{code}</span>
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
  setStudents,
  sendNotice,
  setEmergency,
  leave,
}: {
  code: string;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  sendNotice: (text: string) => void;
  setEmergency: (text: string | null) => void;
  leave: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "All">("All");
  const [selected, setSelected] = useState(students[0] || initialStudents[0]);
  const [notice, setNotice] = useState("");
  const [alert, setAlert] = useState("Please go calmly to the designated assembly point.");
  const [showAlert, setShowAlert] = useState(false);

  const visible = useMemo(
    () => students.filter((student) => (filter === "All" || student.status === filter) && student.name.toLowerCase().includes(query.toLowerCase())),
    [students, query, filter]
  );
  const count = (status: Status) => students.filter((student) => student.status === status).length;
  const clearDemo = () => {
    localStorage.removeItem("vega-demo-state");
    setStudents(initialStudents);
    setSelected(initialStudents[0]);
  };

  return (
    <main className="min-h-screen pb-10">
      <Topbar code={code} type="Organizer" leave={leave} />
      <div className="mx-auto max-w-[1600px] p-4 md:p-7">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-slate-500">Vega demo event</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Group overview</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={clearDemo} className="secondary">
              Reset demo
            </button>
            <button onClick={() => setShowAlert(true)} className="danger">
              Declare emergency
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Students" value={students.length} />
          <Metric label="Safe" value={count("Safe")} color="text-emerald-600" />
          <Metric label="Need help" value={count("Needs help")} color="text-red-600" />
          <Metric label="Unchecked" value={count("Unchecked")} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 p-5">
              <div className="flex justify-between">
                <h2 className="font-semibold text-slate-900">Students</h2>
                <span className="text-xs text-slate-500">{visible.length} shown</span>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search students"
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
            <div className="max-h-[440px] overflow-auto">
              {visible.map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSelected(student)}
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
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900">Live map</h2>
                <p className="mt-1 text-xs text-slate-500">Last reported locations</p>
              </div>
              <div className="h-[360px] sm:h-[430px]">
                {selected && <EventMap students={students} selected={selected} onSelect={(student) => setSelected(student)} />}
              </div>
            </div>
            {selected && (
              <aside className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected student</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{selected.name}</h2>
                <div className="mt-3">
                  <Badge status={selected.status} />
                </div>
                <div className="mt-5 space-y-3 border-y border-slate-100 py-4 text-sm">
                  <p>
                    <span className="block text-xs text-slate-400">Emergency contact</span>
                    {selected.phone}
                  </p>
                  {selected.issue && (
                    <p>
                      <span className="block text-xs text-slate-400">Current report</span>
                      <span className="font-medium text-red-600">{selected.issue}</span>
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    setStudents((all) =>
                      all.map((student) => (student.id === selected.id ? { ...student, status: "Safe", issue: undefined, lastSeen: "Just now" } : student))
                    )
                  }
                  className="secondary mt-5 w-full"
                >
                  Mark safe
                </button>
              </aside>
            )}
          </section>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-900">Broadcast announcement</h2>
            <textarea
              value={notice}
              onChange={(event) => setNotice(event.target.value)}
              placeholder="Write an update for your group…"
              className="field mt-4 min-h-24 resize-none"
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
              {notices.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                  <p className="text-sm text-slate-800">{item.text}</p>
                  <p className="mt-2 text-xs text-slate-400">{item.time}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      {showAlert && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-red-600">HIGH PRIORITY ALERT</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Declare an emergency?</h2>
            <textarea value={alert} onChange={(event) => setAlert(event.target.value)} className="field mt-5 min-h-24 resize-none" />
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
  status,
  setStatus,
  notices,
  emergency,
  clearEmergency,
  leave,
}: {
  code: string;
  name: string;
  status: Status;
  setStatus: (status: Status) => void;
  notices: Notice[];
  emergency: string | null;
  clearEmergency: () => void;
  leave: () => void;
}) {
  const [location, setLocation] = useState("Location not shared yet");
  const [report, setReport] = useState<string | null>(null);

  const locate = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return setLocation("Location is unavailable in this browser");
    }
    setLocation("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · just now`),
      () => setLocation("Location permission was not granted"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const needHelp = (issue: string) => {
    setReport(issue);
    setStatus("Needs help");
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
              <p className="mt-1 text-sm text-slate-500">Your organizer can see this update.</p>
            </div>
            <button
              onClick={() => {
                setStatus("Safe");
                setReport(null);
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
              <p className="mt-1 text-sm text-slate-500">{location}</p>
            </div>
            <button onClick={locate} className="secondary min-h-[44px]">
              Update location
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Need help?</h2>
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
          {report && <p className="mt-4 text-sm font-medium text-red-600">Your {report.toLowerCase()} report has been shared.</p>}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Alerts & announcements</h2>
          <div className="mt-4 space-y-3">
            {notices.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                <p className="text-sm leading-6 text-slate-800">{item.text}</p>
                <p className="mt-2 text-xs text-slate-400">Organizer · {item.time}</p>
              </article>
            ))}
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
