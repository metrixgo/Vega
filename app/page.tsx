"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, loginUser, registerUser, User } from "@/lib/auth";

export default function LandingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"organizer" | "participant">("organizer");
  const [authError, setAuthError] = useState<string | null>(null);

  // Guest Quick Join state
  const [joinCode, setJoinCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [showGuestJoin, setShowGuestJoin] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      if (authMode === "signup") {
        const u = registerUser(email, password, name, role);
        setUser(u);
      } else {
        const u = loginUser(email, password);
        setUser(u);
      }
      setShowAuthModal(false);
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError("Authentication failed. Please check your credentials.");
      }
    }
  };

  const handleGuestCreate = async () => {
    const code = `VEGA-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", code }),
      });
    } catch {
      /* ignore */
    }
    router.push(`/organizer/event/${code}`);
  };

  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !guestName.trim()) return;
    const cleanCode = joinCode.trim().toUpperCase();

    try {
      await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: cleanCode, name: guestName.trim(), phone: guestPhone.trim() }),
      });
    } catch {
      /* ignore */
    }

    router.push(`/participant/event/${cleanCode}?name=${encodeURIComponent(guestName)}&phone=${encodeURIComponent(guestPhone)}`);
  };

  return (
    <main className="min-h-screen p-5 md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900 shadow-sm">
              <Image src="/images/logo.png" alt="Vega Logo" fill className="object-cover" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg">Vega Safety Manager</span>
              <span className="block text-xs text-slate-500">Real-time Group Safety & GPS Sync</span>
            </div>
          </div>
          <div>
            {user ? (
              <Link href="/dashboard" className="primary inline-flex items-center gap-2">
                Go to Dashboard →
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                    setShowAuthModal(true);
                  }}
                  className="secondary font-semibold text-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                    setShowAuthModal(true);
                  }}
                  className="primary font-semibold text-sm"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="grid min-h-[75vh] items-center gap-12 py-10 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Cross-Device GPS Sync Active
            </div>
            <h1 className="max-w-xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Stay connected when it matters most.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              A real-time safety hub for trips, events, and outdoor group activities. Track live locations on mobile maps, send instant check-ins, and broadcast emergency popups across devices.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              {user ? (
                <Link href="/dashboard" className="primary px-6 py-3.5 text-base shadow-sm">
                  Open Account Dashboard
                </Link>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError(null);
                      setShowAuthModal(true);
                    }}
                    className="primary px-6 py-3.5 text-base shadow-sm"
                  >
                    Create Account
                  </button>
                  <button onClick={handleGuestCreate} className="secondary px-6 py-3.5 text-base">
                    Quick Create Event
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="font-semibold text-slate-900 text-lg">Organize an Event</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Create a persistent safety room, monitor live participant GPS pins on interactive Leaflet maps, and broadcast alerts.
              </p>
              <button
                onClick={user ? () => router.push("/dashboard") : handleGuestCreate}
                className="mt-4 inline-flex items-center gap-2 font-semibold text-slate-900 underline underline-offset-4"
              >
                Create event now →
              </button>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="font-semibold text-slate-900 text-lg">Join an Event</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter an event code shared by your organizer, share your live GPS position, and check in safe.
              </p>
              <button
                onClick={() => setShowGuestJoin(true)}
                className="mt-4 inline-flex items-center gap-2 font-semibold text-slate-900 underline underline-offset-4"
              >
                Enter event code →
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Email + Password Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">{authMode === "login" ? "Sign In to Account" : "Register New Account"}</h2>
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {authError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="field mt-1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field mt-1.5"
                />
              </div>

              {authMode === "signup" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="field mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Primary Account Role</label>
                    <select value={role} onChange={(e) => setRole(e.target.value as "organizer" | "participant")} className="field mt-1.5 bg-white">
                      <option value="organizer">Organizer (Manage events & participants)</option>
                      <option value="participant">Participant (Check-in & share location)</option>
                    </select>
                  </div>
                </>
              )}

              <button type="submit" className="primary w-full py-3 mt-2 font-semibold">
                {authMode === "login" ? "Sign In & Open Dashboard" : "Register Account"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              {authMode === "login" ? (
                <p>
                  Don’t have an account?{" "}
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError(null);
                    }}
                    className="font-bold text-slate-900 underline"
                  >
                    Register
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError(null);
                    }}
                    className="font-bold text-slate-900 underline"
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guest Join Modal */}
      {showGuestJoin && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Join Event</h2>
              <button onClick={() => setShowGuestJoin(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleGuestJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Event Code</label>
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="VEGA-8492"
                  className="field mt-1.5 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="John Smith"
                  className="field mt-1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Emergency Phone</label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="field mt-1.5"
                />
              </div>

              <button type="submit" className="primary w-full py-3 mt-2 font-semibold">
                Join Event Now
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
