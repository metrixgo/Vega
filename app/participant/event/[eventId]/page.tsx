"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isNotificationGranted, requestNotificationPermission, triggerNotification } from "@/lib/notifications";
import type { Status, Notice } from "@/lib/types";

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

  const rawCode = (params?.eventId as string) || "VEGA-MAIN";
  const code = rawCode.toUpperCase();

  const queryName = searchParams?.get("name") || "";
  const queryPhone = searchParams?.get("phone") || "";

  const [name, setName] = useState(queryName);
  const [phone, setPhone] = useState(queryPhone);
  const [studentId, setStudentId] = useState<number | null>(null);

  const [status, setStatus] = useState<Status>("Unchecked");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activeEmergency, setActiveEmergency] = useState<string | null>(null);
  const [dismissedEmergencyText, setDismissedEmergencyText] = useState<string | null>(null);

  const [locationText, setLocationText] = useState("GPS Location not shared yet");
  const [report, setReport] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);

  const prevNoticeCountRef = useRef<number>(0);
  const prevEmergencyRef = useRef<string | null>(null);

  useEffect(() => {
    setNotifGranted(isNotificationGranted());
    if (!name) {
      const user = getCurrentUser();
      if (user) {
        setName(user.name);
      } else {
        const promptName = prompt("Please enter your full name to check in:", "Guest") || "Guest";
        setName(promptName);
      }
    }
  }, [name]);

  const handleEnableNotifs = async () => {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (granted) {
      triggerNotification("Notifications Enabled", { body: "You will receive popups for announcements & emergency alerts." }, "notice");
    }
  };

  // Poll server for event status & notices
  useEffect(() => {
    if (!name) return;
    let isSubscribed = true;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/event?code=${encodeURIComponent(code)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isSubscribed) {
          const currentNotices: Notice[] = data.notices || [];
          setNotices(currentNotices);

          // Emergency Alert Logic (Fixes Emergency Popup Loop Bug)
          const serverEmergency: string | null = data.emergency || null;
          if (serverEmergency && serverEmergency !== dismissedEmergencyText) {
            setActiveEmergency(serverEmergency);
          } else if (!serverEmergency) {
            setActiveEmergency(null);
            setDismissedEmergencyText(null); // Reset dismissed token when server clears emergency
          }

          // Find current student status & ID from server
          const me = (data.students || []).find((s: { id: number; name: string; phone?: string }) => s.name.toLowerCase() === name.toLowerCase() || (phone && s.phone === phone));
          if (me) {
            setStatus(me.status);
            setStudentId(me.id);
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
  }, [code, name, phone, dismissedEmergencyText]);

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

  const handleNeedHelp = (issue: string) => {
    setReport(issue);
    handleUpdateStatus("Needs help", issue);
  };

  const handleClearEmergency = async () => {
    if (activeEmergency) {
      setDismissedEmergencyText(activeEmergency);
    }
    setActiveEmergency(null);
    handleUpdateStatus("Safe");

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_emergency", code }),
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="min-h-screen pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900 shadow-sm">
            <Image src="/images/logo.png" alt="Vega Logo" fill className="object-cover" />
          </Link>
          <div>
            <div className="font-bold text-slate-900">Vega Safety Check-In</div>
            <div className="text-xs text-slate-500">Participant View</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!notifGranted && (
            <button onClick={handleEnableNotifs} className="secondary text-xs font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200">
              🔔 Enable Notifications
            </button>
          )}
          <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-800">{code}</span>
          <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-slate-500">Hello, {name.split(" ")[0]}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Your Safety Check-In</h1>
          </div>
          <Badge status={status} />
        </div>

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
          <p className="text-xs text-slate-400 mt-1">Tap a category below to immediately alert your organizer</p>
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

      {/* Emergency Full-Screen Red Alert Modal (With Permanent Dismissal Token) */}
      {activeEmergency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-600 p-5 text-center text-white animate-fade-in">
          <div className="max-w-lg">
            <p className="text-sm font-extrabold uppercase tracking-[.2em] text-red-100">HIGH PRIORITY EMERGENCY</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">TAKE ACTION NOW</h2>
            <p className="mt-5 text-lg leading-8 text-red-50 font-medium">{activeEmergency}</p>
            <button
              onClick={handleClearEmergency}
              className="mt-10 w-full rounded-xl bg-white px-6 py-4 font-bold text-red-700 shadow-xl min-h-[56px] text-lg active:scale-95 transition"
            >
              I AM SAFE
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
