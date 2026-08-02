"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUser, removeJoinedEventFromUser } from "@/lib/auth";
import { isNotificationGranted, requestNotificationPermission, triggerNotification } from "@/lib/notifications";
import type { Status, Notice, CheckInRequest, EventData, ChatMessage } from "@/lib/types";

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

export default function ParticipantEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawCode = (params?.eventId as string) || "8492";
  const code = rawCode.toUpperCase();

  const queryName = searchParams?.get("name") || "";
  const queryPhone = searchParams?.get("phone") || "";

  const [name, setName] = useState(queryName);
  const [phone, setPhone] = useState(queryPhone);
  const [studentId, setStudentId] = useState<number | null>(null);

  const [eventData, setEventData] = useState<EventData | null>(null);
  const [status, setStatus] = useState<Status>("Unchecked");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkInReq, setCheckInReq] = useState<CheckInRequest | null>(null);
  const [hasConfirmedCheckIn, setHasConfirmedCheckIn] = useState(false);

  const [activeEmergency, setActiveEmergency] = useState<string | null>(null);
  const [dismissedEmergencyText, setDismissedEmergencyText] = useState<string | null>(null);

  const [locationText, setLocationText] = useState("GPS Location not shared yet");
  const [report, setReport] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);

  // Private Chat State
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInputText, setChatInputText] = useState("");

  const prevNoticeCountRef = useRef<number>(0);
  const prevEmergencyRef = useRef<string | null>(null);
  const prevCheckInIdRef = useRef<number | null>(null);
  const prevMessageCountRef = useRef<number>(0);

  // Require Authentication Lock & Auto-Request Push Permission
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push("/");
      return;
    }
    if (!name && user.name) setName(user.name);
    requestNotificationPermission().then((granted) => setNotifGranted(granted));
  }, [name, router]);

  const handleEnableNotifs = async () => {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (granted) {
      triggerNotification("Notifications Enabled", { body: "You will receive popups for announcements, alerts & messages." }, "notice");
    }
  };

  // Poll server for event status
  useEffect(() => {
    if (!name) return;
    let isSubscribed = true;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/event?code=${encodeURIComponent(code)}`);
        if (!res.ok) {
          const errData = await res.json();

          if (errData.deleted) {
            alert("This event has been deleted by the organizer.");
            removeJoinedEventFromUser(code);
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

        if (data.deleted) {
          alert("This event has been deleted by the organizer.");
          removeJoinedEventFromUser(code);
          router.push("/dashboard");
          return;
        }

        if (isSubscribed) {
          setEventData(data);
          const currentNotices: Notice[] = data.notices || [];
          const currentMsgs: ChatMessage[] = data.messages || [];
          setNotices(currentNotices);
          setMessages(currentMsgs);

          // Handle Check-In Banner visibility
          if (data.checkInRequest && data.checkInRequest.id !== prevCheckInIdRef.current) {
            setHasConfirmedCheckIn(false);
          }
          setCheckInReq(data.checkInRequest || null);

          // Save to local cache
          if (typeof window !== "undefined") {
            localStorage.setItem(`vega_cache_event_${code}`, JSON.stringify(data));
          }

          // Emergency Alert Logic
          const serverEmergency: string | null = data.emergency || null;
          if (serverEmergency && serverEmergency !== dismissedEmergencyText) {
            setActiveEmergency(serverEmergency);
          } else if (!serverEmergency) {
            setActiveEmergency(null);
            setDismissedEmergencyText(null);
          }

          // Find current student status & ID from server
          const me = (data.students || []).find(
            (s: { id: number; name: string; phone?: string }) => s.name.toLowerCase() === name.toLowerCase() || (phone && s.phone === phone)
          );
          if (me) {
            setStatus(me.status);
            setStudentId(me.id);
            if (me.checkedInAt) setHasConfirmedCheckIn(true);
          }

          // Native Popup Notification for Check-In Request
          if (data.checkInRequest && data.checkInRequest.active && data.checkInRequest.id !== prevCheckInIdRef.current) {
            triggerNotification("⏱ CHECK-IN REQUESTED", { body: data.checkInRequest.title }, "notice");
            prevCheckInIdRef.current = data.checkInRequest.id;
          }

          // Native Popup Notification for New Announcements
          if (currentNotices.length > prevNoticeCountRef.current && prevNoticeCountRef.current > 0) {
            const latest = currentNotices[0];
            triggerNotification("📢 Announcement from Organizer", { body: latest.text }, "notice");
          }
          prevNoticeCountRef.current = currentNotices.length;

          // Native Popup Notification for Emergency Alert
          if (serverEmergency && serverEmergency !== prevEmergencyRef.current && serverEmergency !== dismissedEmergencyText) {
            triggerNotification("🚨 EMERGENCY ALERT - TAKE ACTION", { body: serverEmergency }, "emergency");
          }
          prevEmergencyRef.current = serverEmergency;

          // Check for incoming private messages from Organizer
          const incomingOrgMsgs = currentMsgs.filter((m) => {
            if (m.senderId !== "organizer") return false;
            const sid = studentId ? String(studentId) : "";
            const sName = name.toLowerCase();
            return (
              (sid && m.recipientId === sid) ||
              m.recipientId.toLowerCase() === sName ||
              (phone && m.recipientId === phone)
            );
          });

          if (incomingOrgMsgs.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
            const latest = incomingOrgMsgs[incomingOrgMsgs.length - 1];
            triggerNotification("💬 Private Message from Organizer", { body: latest.text }, "notice");
          }
          prevMessageCountRef.current = incomingOrgMsgs.length;
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
  }, [code, name, phone, dismissedEmergencyText, studentId, router]);

  // Robust Message Filter for Participant
  const participantMessages = useMemo(() => {
    const sid = studentId ? String(studentId) : "";
    const sName = name.toLowerCase();

    return messages.filter((m) => {
      const matchFromOrg =
        m.senderId === "organizer" &&
        ((sid && m.recipientId === sid) || m.recipientId.toLowerCase() === sName || (phone && m.recipientId === phone));
      const matchToOrg =
        m.recipientId === "organizer" &&
        ((sid && m.senderId === sid) || m.senderName.toLowerCase() === sName || (phone && m.senderId === phone));
      return matchFromOrg || matchToOrg;
    });
  }, [messages, studentId, name, phone]);

  const unreadCount = useMemo(() => {
    const sid = studentId ? String(studentId) : "";
    const sName = name.toLowerCase();

    return messages.filter(
      (m) =>
        !m.read &&
        m.senderId === "organizer" &&
        ((sid && m.recipientId === sid) || m.recipientId.toLowerCase() === sName || (phone && m.recipientId === phone))
    ).length;
  }, [messages, studentId, name, phone]);

  const handleLocate = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return setLocationText("Location is unavailable in this browser");
    }
    setLocationText("Finding your GPS location…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLocationText(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · just now`);

        try {
          await fetch("/api/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_location", code, studentId, studentName: name, phone, location: coords }),
          });
        } catch {
          /* ignore */
        }
      },
      () => setLocationText("Location permission was not granted"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleUpdateStatus = async (nextStatus: Status, issueStr?: string) => {
    setStatus(nextStatus);
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", code, studentId, studentName: name, phone, status: nextStatus, issue: issueStr }),
      });
    } catch {
      /* ignore */
    }
  };

  const handleConfirmCheckIn = async () => {
    setStatus("Safe");
    setHasConfirmedCheckIn(true);
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_check_in", code, studentId, studentName: name, phone }),
      });
    } catch {
      /* ignore */
    }
  };

  const handleNeedHelp = (issue: string) => {
    setReport(issue);
    handleUpdateStatus("Needs help", issue);
    setShowChatModal(true);
  };

  const handleClearEmergency = async (responseOption: "safe" | "help") => {
    if (activeEmergency) {
      setDismissedEmergencyText(activeEmergency);
    }
    setActiveEmergency(null);

    if (responseOption === "safe") {
      setStatus("Safe");
      try {
        await fetch("/api/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "clear_emergency",
            code,
            studentId,
            studentName: name,
            phone,
            status: "Safe",
          }),
        });
      } catch {
        /* ignore */
      }
    } else {
      setStatus("Needs help");
      handleNeedHelp("Emergency Alert Assistance Needed");
    }
  };

  const handleSendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;

    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          code,
          senderId: String(studentId || name),
          senderName: name,
          recipientId: "organizer",
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

  const handleLeaveEvent = async () => {
    if (!confirm("Are you sure you want to leave this event session?")) return;

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", code, studentId, studentName: name, phone }),
      });
    } catch {
      /* ignore */
    }

    removeJoinedEventFromUser(code);
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
            <div className="font-bold text-slate-900">{eventData?.name || "Vega Safety Check-In"}</div>
            <div className="text-xs text-slate-500">{eventData?.category || "General"} Participant Space</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!notifGranted && (
            <button onClick={handleEnableNotifs} className="secondary text-xs font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200">
              🔔 Enable Notifications
            </button>
          )}
          <span className="rounded-lg bg-slate-900 text-white px-3 py-1 font-mono text-sm font-extrabold tracking-widest">{code}</span>
          <button onClick={handleLeaveEvent} className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg ring-1 ring-red-200">
            Leave Event
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-slate-500">Hello, {name.split(" ")[0]}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Your Safety Check-In</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChatModal(true)}
              className="relative secondary font-semibold text-xs py-2 px-3 flex items-center gap-1.5"
            >
              💬 Private Chat
              {unreadCount > 0 && (
                <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <Badge status={status} />
          </div>
        </div>

        {/* Check-In Request Banner */}
        {checkInReq && checkInReq.active && !hasConfirmedCheckIn && (
          <section className="mt-6 rounded-2xl bg-emerald-600 text-white p-6 shadow-md border border-emerald-500 animate-pulse">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">⏱ Check-In Requested by Organizer</span>
                <h2 className="text-xl font-extrabold mt-1">{checkInReq.title}</h2>
                {checkInReq.scheduledTime && <p className="text-xs text-emerald-100 mt-1">Deadline: {checkInReq.scheduledTime}</p>}
              </div>
              <button
                onClick={handleConfirmCheckIn}
                className="w-full sm:w-auto bg-white text-emerald-700 font-extrabold px-6 py-3 rounded-xl shadow-md hover:bg-emerald-50 active:scale-95 transition"
              >
                CONFIRM CHECK-IN NOW
              </button>
            </div>
          </section>
        )}

        {/* Current Status Box */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Status</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {status === "Safe" ? "You’re marked safe" : status === "Needs help" ? "Assistance requested" : "Check-in required"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Your organizer sees your live status in real time.</p>
            </div>
            <button
              onClick={() => {
                setReport(null);
                handleUpdateStatus("Safe");
              }}
              className="primary bg-emerald-600 hover:bg-emerald-700 min-h-[50px] px-6 text-base font-bold shadow-sm"
            >
              I AM SAFE
            </button>
          </div>
        </section>

        {/* Location Box */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Share GPS Location</h2>
              <p className="mt-1 text-sm text-slate-500">{locationText}</p>
            </div>
            <button onClick={handleLocate} className="secondary min-h-[44px] font-semibold">
              Update GPS Location
            </button>
          </div>
        </section>

        {/* Need Help Emergency Options */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Need Assistance?</h2>
          <p className="text-xs text-slate-400 mt-1">Tap a category below to immediately alert your organizer & open private chat</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["Fire", "Injury", "Lost", "Hazard"].map((issue) => (
              <button
                key={issue}
                onClick={() => handleNeedHelp(issue)}
                className={`rounded-xl border p-4 text-sm font-bold min-h-[56px] transition ${
                  report === issue ? "border-red-400 bg-red-50 text-red-700 shadow-sm" : "border-slate-200 hover:border-slate-400 text-slate-800"
                }`}
              >
                {issue}
              </button>
            ))}
          </div>
          {report && <p className="mt-4 text-sm font-semibold text-red-600">Your {report.toLowerCase()} report has been pushed to the organizer.</p>}
        </section>

        {/* Announcements List */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-900">Alerts & Broadcasts</h2>
          <div className="mt-4 space-y-3">
            {notices.length === 0 ? (
              <p className="text-sm text-slate-400 py-3">No announcements from organizer yet.</p>
            ) : (
              notices.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                  <p className="text-sm leading-6 text-slate-800 font-medium">{item.text}</p>
                  <p className="mt-2 text-xs text-slate-400">Organizer · {item.time}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Private 1-on-1 Chat Modal */}
      {showChatModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl flex flex-col h-[520px]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">Private Chat with Organizer</h2>
                <p className="text-xs text-slate-500">Direct 1-on-1 confidential messages</p>
              </div>
              <button onClick={() => setShowChatModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto py-4 space-y-3">
              {participantMessages.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  No private messages yet. Send a message to your event organizer below.
                </div>
              ) : (
                participantMessages.map((msg) => {
                  const isMe = msg.senderId !== "organizer";
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
                placeholder="Message event organizer…"
                className="field flex-1 text-sm"
              />
              <button type="submit" className="primary px-4 py-2 text-sm font-semibold">
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Full-Screen Red Alert Modal (With Dual Response Options) */}
      {activeEmergency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-600 p-5 text-center text-white animate-fade-in">
          <div className="max-w-lg w-full">
            <p className="text-sm font-extrabold uppercase tracking-[.2em] text-red-100">HIGH PRIORITY EMERGENCY</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">TAKE ACTION NOW</h2>
            <p className="mt-5 text-lg leading-8 text-red-50 font-medium">{activeEmergency}</p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => handleClearEmergency("safe")}
                className="flex-1 rounded-xl bg-white px-6 py-4 font-bold text-emerald-700 shadow-xl min-h-[56px] text-lg active:scale-95 transition"
              >
                I AM SAFE
              </button>
              <button
                onClick={() => handleClearEmergency("help")}
                className="flex-1 rounded-xl bg-slate-900 px-6 py-4 font-bold text-white shadow-xl min-h-[56px] text-lg active:scale-95 transition"
              >
                I NEED HELP
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
