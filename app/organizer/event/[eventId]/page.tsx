"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUser, removeOrganizedEventFromUser } from "@/lib/auth";
import { isNotificationGranted, requestNotificationPermission, triggerNotification } from "@/lib/notifications";
import type { Status, Student, Notice, CheckInRequest, EventData, ChatMessage } from "@/lib/types";

const EventMap = dynamic(() => import("@/app/map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading live Leaflet map…</div>,
});

const tone: Record<Status, string> = {
  Safe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Needs help": "bg-red-50 text-red-700 ring-red-200",
  Unchecked: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Badge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "Safe" ? "bg-emerald-500" : status === "Needs help" ? "bg-red-500" : "bg-slate-400"}`} />
      {status}
    </span>
  );
}

const EMERGENCY_TYPES = [
  {
    type: "Earthquake",
    icon: "🌐",
    text: "EARTHQUAKE ALERT: Drop, Cover, and Hold On! Stay away from windows and heavy furniture. Move to open safe areas if outdoors.",
  },
  {
    type: "Typhoon / Severe Storm",
    icon: "🌀",
    text: "TYPHOON ALERT: Seek immediate indoor shelter in a sturdy building. Stay away from windows and exterior doors.",
  },
  {
    type: "Active Threat / Gunshots",
    icon: "🚨",
    text: "ACTIVE THREAT ALERT: Run, Hide, Fight! Lock doors, turn off lights, remain silent, and silence all mobile devices.",
  },
  {
    type: "Chaotic Evacuation",
    icon: "⚠️",
    text: "EMERGENCY EVACUATION: Please proceed immediately and calmly to the designated primary assembly point.",
  },
];

export default function OrganizerEventPage() {
  const params = useParams();
  const router = useRouter();
  const rawCode = (params?.eventId as string) || "8492";
  const code = rawCode.toUpperCase();

  const [eventData, setEventData] = useState<EventData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkInReq, setCheckInReq] = useState<CheckInRequest | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "All">("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [noticeText, setNoticeText] = useState("");

  // Emergency Modal State
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [emergencyType, setEmergencyType] = useState<string>("Earthquake");
  const [customEmergencyType, setCustomEmergencyType] = useState("");
  const [alertText, setAlertText] = useState(EMERGENCY_TYPES[0].text);

  // Private Chat State
  const [chatInputText, setChatInputText] = useState("");
  const [showChatModal, setShowChatModal] = useState(false);

  // Check-In Modal State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInTitle, setCheckInTitle] = useState("Instant Safety Check-In");
  const [scheduledTime, setScheduledTime] = useState("");
  const [banner, setBanner] = useState<{ type: "notice" | "emergency" | "checkin"; title: string; message: string } | null>(null);

  const [notifGranted, setNotifGranted] = useState(false);
  const prevHelpStudentsRef = useRef<Set<number>>(new Set());
  const prevLastMessageIdRef = useRef<number>(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Require Authentication Lock & Auto-Request Notifications
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push("/");
      return;
    }
    requestNotificationPermission().then((granted) => setNotifGranted(granted));
  }, [router]);

  const showBanner = (type: "notice" | "emergency" | "checkin", title: string, message: string) => {
    setBanner({ type, title, message });
    window.setTimeout(() => setBanner(null), 4000);
  };

  const handleEnableNotifs = async () => {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (granted) {
      triggerNotification("Notifications Enabled", { body: "You will receive popups when participants request help or send messages." }, "notice");
    }
  };

  // Poll server for live event data
  useEffect(() => {
    let isSubscribed = true;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/event?code=${encodeURIComponent(code)}`);
        if (!res.ok) {
          const errData = await res.json();

          if (errData.deleted) {
            if (typeof window !== "undefined") {
              localStorage.removeItem(`vega_cache_event_${code}`);
            }
            alert("This event has been deleted.");
            removeOrganizedEventFromUser(code);
            router.push("/dashboard");
            return;
          }

          // Auto-rehydrate if missing from server RAM
          if (typeof window !== "undefined") {
            const cached = localStorage.getItem(`vega_cache_event_${code}`);
            if (cached) {
              try {
                const parsed: EventData = JSON.parse(cached);
                const restoreRes = await fetch("/api/event", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restore", code, eventData: parsed }),
                });
                if (restoreRes.ok && isSubscribed) {
                  const restored: EventData = await restoreRes.json();
                  setEventData(restored);
                  setStudents(restored.students || []);
                  setNotices(restored.notices || []);
                  setMessages(restored.messages || []);
                  setCheckInReq(restored.checkInRequest || null);
                  return;
                }
              } catch {
                /* ignore */
              }
            }
          }
          return;
        }

        const data: EventData = await res.json();
        if (isSubscribed) {
          setEventData(data);
          const currentStudents: Student[] = data.students || [];
          const currentMsgs: ChatMessage[] = data.messages || [];
          setStudents(currentStudents);
          setNotices(data.notices || []);
          setMessages(currentMsgs);
          setCheckInReq(data.checkInRequest || null);

          // Save to local cache
          if (typeof window !== "undefined") {
            localStorage.setItem(`vega_cache_event_${code}`, JSON.stringify(data));
          }

          // Check for newly reported help requests
          const helpStudents = currentStudents.filter((s) => s.status === "Needs help");
          helpStudents.forEach((s) => {
            if (!prevHelpStudentsRef.current.has(s.id)) {
              triggerNotification(
                `⚠️ HELP REQUESTED: ${s.name}`,
                { body: `${s.name} reported: ${s.issue || "Assistance needed"}` },
                "help"
              );
            }
          });
          prevHelpStudentsRef.current = new Set(helpStudents.map((s) => s.id));

          // Check for new incoming private messages for organizer
          const incomingOrgMsgs = currentMsgs.filter((m) => m.recipientId === "organizer");
          if (incomingOrgMsgs.length > 0) {
            const latest = incomingOrgMsgs[incomingOrgMsgs.length - 1];
            if (latest.id > prevLastMessageIdRef.current) {
              if (prevLastMessageIdRef.current > 0) {
                triggerNotification(`💬 Private Message from ${latest.senderName}`, { body: latest.text }, "notice");
              }
              prevLastMessageIdRef.current = latest.id;
            }
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);

    const handleVis = () => {
      if (typeof document !== "undefined" && !document.hidden) poll();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVis);
    }

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVis);
      }
    };
  }, [code, router]);

  const selected = useMemo(() => students.find((s) => s.id === selectedId) || students[0] || null, [students, selectedId]);

  // Robust Private Message Filter
  const selectedChatMessages = useMemo(() => {
    if (!selected) return [];
    const sid = String(selected.id);
    const sName = selected.name.toLowerCase();
    const sPhone = selected.phone;

    return messages.filter((m) => {
      const matchSender = m.senderId === sid || m.senderName.toLowerCase() === sName || (sPhone && m.senderId === sPhone);
      const matchRecipient = m.recipientId === sid || m.recipientId.toLowerCase() === sName || (sPhone && m.recipientId === sPhone);
      return matchSender || matchRecipient;
    });
  }, [messages, selected]);

  useEffect(() => {
    if (!showChatModal || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [showChatModal, selectedChatMessages]);

  const visible = useMemo(
    () => students.filter((student) => (filter === "All" || student.status === filter) && student.name.toLowerCase().includes(query.toLowerCase())),
    [students, query, filter]
  );

  const count = (status: Status) => students.filter((student) => student.status === status).length;
  const checkedInCount = useMemo(() => students.filter((s) => s.checkedInAt && s.status === "Safe").length, [students]);

  const unreadMessageCount = (student: Student) => {
    const sid = String(student.id);
    const sName = student.name.toLowerCase();
    const sPhone = student.phone;
    return messages.filter(
      (m) =>
        !m.read &&
        m.recipientId === "organizer" &&
        (m.senderId === sid || m.senderName.toLowerCase() === sName || (sPhone && m.senderId === sPhone))
    ).length;
  };

  const handleSelectEmergencyType = (item: typeof EMERGENCY_TYPES[0]) => {
    setEmergencyType(item.type);
    setCustomEmergencyType("");
    setAlertText(item.text);
  };

  const syncEventState = (data: EventData) => {
    setEventData(data);
    setStudents(data.students || []);
    setNotices(data.notices || []);
    setMessages(data.messages || []);
    setCheckInReq(data.checkInRequest || null);
  };

  const handleSendNotice = async () => {
    if (!noticeText.trim()) return;
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notice", code, text: noticeText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        syncEventState(data);
        triggerNotification("📢 Announcement Broadcasted", { body: noticeText.trim() }, "notice");
        showBanner("notice", "Announcement Sent", noticeText.trim());
        setNoticeText("");
      }
    } catch {
      /* ignore */
    }
  };

  const handleSendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !selected) return;

    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          code,
          senderId: "organizer",
          senderName: "Organizer",
          recipientId: String(selected.id),
          text: chatInputText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setChatInputText("");
      }
    } catch {
      /* ignore */
    }
  };

  const handleTriggerCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowCheckInModal(false);
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_check_in",
          code,
          checkInTitle: checkInTitle.trim() || "Safety Check-In Request",
          scheduledTime: scheduledTime || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        syncEventState(data);
        triggerNotification("⏱ Check-In Request Sent", { body: checkInTitle.trim() }, "notice");
        showBanner("checkin", "Check-In Sent", checkInTitle.trim());
      }
    } catch {
      /* ignore */
    }
  };

  const handleClearCheckIn = async () => {
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_check_in", code }),
      });
      setCheckInReq(null);
    } catch {
      /* ignore */
    }
  };

  const handleDeclareEmergency = async () => {
    setShowAlertModal(false);
    const type = customEmergencyType.trim() || emergencyType;
    const fullEmergencyPayload = `[${type.toUpperCase()}] ${alertText.trim()}`;

    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "emergency", code, text: fullEmergencyPayload }),
      });
      if (res.ok) {
        const data = await res.json();
        syncEventState(data);
      }
      triggerNotification(`🚨 ${type.toUpperCase()} EMERGENCY DECLARED`, { body: alertText }, "emergency");
      showBanner("emergency", `${type.toUpperCase()} Alert`, alertText);
    } catch {
      /* ignore */
    }
  };

  const handleMarkSafe = async (studentId: number) => {
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_safe", code, studentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteEvent = async () => {
    if (!confirm(`Are you sure you want to delete event code ${code}? This will remove it permanently for all participants.`)) return;

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
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900 shadow-sm">
            <Image src="/images/logo.png" alt="Vega Logo" fill className="object-cover" />
          </Link>
          <div>
            <div className="font-bold text-slate-900">{eventData?.name || "Vega Safety Control Center"}</div>
            <div className="text-xs text-slate-500">
              {eventData?.category || "General"} · {students.length} / {eventData?.maxParticipants || 20} Capacity
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!notifGranted && (
            <button onClick={handleEnableNotifs} className="secondary text-xs font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200">
              🔔 Enable Notifications
            </button>
          )}
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold text-slate-400">Join Code</span>
            <span className="rounded-lg bg-slate-900 text-white px-3 py-1 font-mono text-sm font-extrabold tracking-widest">{code}</span>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] p-4 md:p-7">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">● Live Cross-Device Sync Active</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{eventData?.name || "Group Monitor & Safety"}</h1>
            {eventData?.description && <p className="mt-1 text-sm text-slate-500">{eventData.description}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCheckInModal(true)} className="primary text-xs px-4 py-2 bg-slate-800 hover:bg-slate-900">
              ⏱ Request Check-In
            </button>
            <button onClick={() => setShowAlertModal(true)} className="danger text-sm px-4 py-2 bg-red-600 hover:bg-red-700">
              Declare Emergency
            </button>
            <button onClick={handleDeleteEvent} className="danger text-xs px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 ring-1 ring-slate-200">
              Delete Event
            </button>
          </div>
        </div>

        {/* Real-time Check-In Progress Banner */}
        {checkInReq && (
          <div className="mb-6 rounded-2xl bg-slate-900 text-white p-5 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Active Check-In Request: {checkInReq.title}
              </div>
              {checkInReq.scheduledTime && <p className="text-xs text-slate-300 mt-1">Scheduled Deadline: {checkInReq.scheduledTime}</p>}
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="flex-1 sm:w-48 bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${students.length > 0 ? Math.round((checkedInCount / students.length) * 100) : 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-200">
                {checkedInCount} / {students.length} Checked In
              </span>
              <button onClick={handleClearCheckIn} className="text-xs text-slate-400 hover:text-white underline">
                Close Request
              </button>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Registered" value={students.length} />
          <Metric label="Safe / Checked In" value={count("Safe")} color="text-emerald-600" />
          <Metric label="Needs Help" value={count("Needs help")} color="text-red-600" />
          <Metric label="Unchecked" value={count("Unchecked")} />
        </div>

        {/* Main Section */}
        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
          {/* Participants List */}
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 p-5">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-slate-900">Participants</h2>
                <span className="text-xs text-slate-500">{visible.length} shown</span>
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
                      <p className="font-medium text-slate-600">No participants joined yet</p>
                      <p className="mt-1 text-xs text-slate-400">Have participants open the app and enter 4-digit code:</p>
                      <div className="mt-3 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 font-mono text-lg font-extrabold tracking-widest">{code}</div>
                    </div>
                  ) : (
                    "No participants match search query."
                  )}
                </div>
              ) : (
                visible.map((student) => {
                  const unread = unreadMessageCount(student);
                  return (
                    <button
                      key={student.id}
                      onClick={() => {
                        setSelectedId(student.id);
                        setShowChatModal(true);
                      }}
                      className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left ${
                        selected?.id === student.id ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="relative grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                        {student.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {student.checkedInAt ? `Checked in at ${student.checkedInAt}` : `Seen ${student.lastSeen}`}
                        </p>
                      </div>
                      <Badge status={student.status} />
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Live Map & Selected Detail Card */}
          <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 p-5">
                <h2 className="font-semibold text-slate-900">Live Participant GPS Map</h2>
                <p className="mt-1 text-xs text-slate-500">Real-time mobile location pins</p>
              </div>
              <div className="h-[360px] sm:h-[430px]">
                <EventMap students={students} selected={selected} onSelect={(student) => setSelectedId(student.id)} />
              </div>
            </div>

            {selected ? (
              <aside className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Participant</p>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">{selected.name}</h2>
                  <div className="mt-3">
                    <Badge status={selected.status} />
                  </div>
                  <div className="mt-5 space-y-3 border-y border-slate-100 py-4 text-sm">
                    <p>
                      <span className="block text-xs text-slate-400">Phone Contact</span>
                      <span className="font-medium text-slate-800">{selected.phone || "Not provided"}</span>
                    </p>
                    <p>
                      <span className="block text-xs text-slate-400">GPS Coordinates</span>
                      <span className="font-mono text-xs text-slate-600">
                        {selected.location[0].toFixed(4)}, {selected.location[1].toFixed(4)}
                      </span>
                    </p>
                    {selected.checkedInAt && (
                      <p>
                        <span className="block text-xs text-slate-400">Check-In Confirmation</span>
                        <span className="font-medium text-emerald-600">{selected.checkedInAt}</span>
                      </p>
                    )}
                    {selected.issue && (
                      <p>
                        <span className="block text-xs text-slate-400">Reported Issue</span>
                        <span className="font-bold text-red-600">{selected.issue}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => setShowChatModal(true)}
                    className="primary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5"
                  >
                    💬 Private Chat with {selected.name.split(" ")[0]}
                  </button>
                  <button onClick={() => handleMarkSafe(selected.id)} className="secondary w-full text-xs font-semibold py-2">
                    Mark Safe
                  </button>
                </div>
              </aside>
            ) : (
              <aside className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 grid place-items-center text-center">
                <p className="text-sm text-slate-400">Select a participant from the list to view details.</p>
              </aside>
            )}
          </section>
        </div>

        {/* Announcements Section */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-900">Broadcast Announcement</h2>
            <p className="text-xs text-slate-400 mt-1">Pushes native background push notification to all participant phones</p>
            <textarea
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              placeholder="Write an announcement for your group…"
              className="field mt-3 min-h-24 resize-none"
            />
            <button onClick={handleSendNotice} className="primary mt-3 font-semibold">
              Send Announcement
            </button>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-900">Recent Announcements</h2>
            <div className="mt-4 space-y-3">
              {notices.length === 0 ? (
                <p className="text-sm text-slate-400 py-3">No announcements sent yet.</p>
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

      {banner && (
        <div className={`fixed top-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border px-4 py-3 shadow-2xl ${banner.type === "emergency" ? "border-red-200 bg-red-600 text-white" : banner.type === "checkin" ? "border-amber-200 bg-amber-500 text-white" : "border-slate-200 bg-slate-900 text-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{banner.type === "emergency" ? "Emergency Broadcast" : banner.type === "checkin" ? "Check-In Request" : "Organizer Notice"}</p>
              <p className="mt-1 text-sm font-semibold">{banner.title}</p>
              <p className="mt-1 text-sm opacity-90">{banner.message}</p>
            </div>
            <button onClick={() => setBanner(null)} className="text-sm font-semibold opacity-80 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {/* Private 1-on-1 Chat Modal */}
      {showChatModal && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl flex flex-col h-[520px]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">Private Chat: {selected.name}</h2>
                <p className="text-xs text-slate-500">Direct 1-on-1 messaging with participant</p>
              </div>
              <button onClick={() => setShowChatModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">
                ✕
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-auto py-4 space-y-3">
              {selectedChatMessages.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  No private messages yet. Type a message below to start chatting.
                </div>
              ) : (
                selectedChatMessages.map((msg) => {
                  const isMe = msg.senderId === "organizer";
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                          isMe ? "bg-slate-900 text-white rounded-br-none" : "bg-slate-100 text-slate-800 rounded-bl-none"
                        }`}
                      >
                        <p>{msg.text}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendPrivateMessage} className="pt-3 border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                placeholder={`Message ${selected.name.split(" ")[0]}…`}
                className="field flex-1 text-sm"
              />
              <button type="submit" className="primary px-4 py-2 text-sm font-semibold">
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Check-In Request Modal */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">Request Safety Check-In</h2>
              <button onClick={() => setShowCheckInModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Prompts all participants on their mobile phones to confirm their wellbeing.</p>

            <form onSubmit={handleTriggerCheckIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Check-In Request Title</label>
                <input
                  type="text"
                  required
                  value={checkInTitle}
                  onChange={(e) => setCheckInTitle(e.target.value)}
                  placeholder="e.g., Afternoon Check-In / Bus Departure Check-In"
                  className="field mt-1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Scheduled Time / Deadline (Optional)</label>
                <input
                  type="text"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  placeholder="e.g., 3:00 PM / In 15 Minutes"
                  className="field mt-1.5"
                />
              </div>

              <div className="mt-5 flex gap-3">
                <button type="button" onClick={() => setShowCheckInModal(false)} className="secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="primary flex-1 font-semibold">
                  Send Check-In Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Modal with Pre-Made Templates & Custom Type */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider">HIGH PRIORITY EMERGENCY ALERT</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Declare an Emergency</h2>
            <p className="mt-1 text-xs text-slate-500">Choose an emergency type or enter a custom one below.</p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Emergency Type</label>
              <div className="grid grid-cols-2 gap-2">
                {EMERGENCY_TYPES.map((tmpl) => (
                  <button
                    key={tmpl.type}
                    type="button"
                    onClick={() => handleSelectEmergencyType(tmpl)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition ${
                      emergencyType === tmpl.type && !customEmergencyType
                        ? "border-red-500 bg-red-50 text-red-700 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <span className="mr-1.5">{tmpl.icon}</span>
                    {tmpl.type}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">Custom Emergency Type (Optional)</label>
              <input
                type="text"
                value={customEmergencyType}
                onChange={(e) => setCustomEmergencyType(e.target.value)}
                placeholder="e.g. Chemical Leak / Power Failure"
                className="field mt-1 text-xs"
              />
            </div>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700">Emergency Alert Message</label>
              <textarea
                value={alertText}
                onChange={(e) => setAlertText(e.target.value)}
                className="field mt-1 min-h-20 text-xs resize-none"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowAlertModal(false)} className="secondary flex-1 text-xs">
                Cancel
              </button>
              <button onClick={handleDeclareEmergency} className="danger flex-1 bg-red-600 hover:bg-red-700 text-xs font-bold py-3">
                Broadcast Emergency Alert
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
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
