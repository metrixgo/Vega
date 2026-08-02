"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { askGemini, type AiAction, type AiMessage } from "@/lib/gemini";
import { getGeminiApiKey } from "@/lib/gemini-settings";
import type { EventData, Student } from "@/lib/types";

type Props = {
  eventData: EventData;
  students: Student[];
  code: string;
  onBroadcastEmergency: (emergencyType: string, message: string) => Promise<void>;
  onSendNotice: (text: string) => Promise<void>;
  onRequestCheckIn: (title: string) => Promise<void>;
  onClose: () => void;
};

export default function AiAssistant({ eventData, students, code, onBroadcastEmergency, onSendNotice, onRequestCheckIn, onClose }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const apiKey = getGeminiApiKey();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: AiMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply = await askGemini(apiKey, userMsg.content, eventData, students, [...messages, userMsg]);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action: AiAction) => {
    if (action.type === "broadcast_emergency") {
      await onBroadcastEmergency(action.emergencyType || "Emergency", action.message);
    } else if (action.type === "send_notice") {
      await onSendNotice(action.message);
    } else if (action.type === "request_check_in") {
      await onRequestCheckIn(action.title || action.message);
    }
  };

  const actionLabel = (action: AiAction) => {
    if (action.type === "broadcast_emergency") return `🚨 Broadcast ${action.emergencyType || "Emergency"} Alert`;
    if (action.type === "request_check_in") return `⏱ Request Check-In`;
    return `📢 Send Announcement`;
  };

  if (!apiKey) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center">
          <h2 className="text-xl font-bold text-slate-900">AI Assistant</h2>
          <p className="mt-3 text-sm text-slate-500">Add your Gemini API key in Settings to use the AI safety assistant.</p>
          <div className="mt-5 flex gap-3 justify-center">
            <Link href="/dashboard" className="primary text-sm px-4 py-2">
              Go to Settings
            </Link>
            <button onClick={onClose} className="secondary text-sm px-4 py-2">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col h-[600px]">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">✨ AI Safety Assistant</h2>
            <p className="text-xs text-slate-500">Event {code} · {students.length} participants</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-bold">
            ✕
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              <p>Ask about the current situation or what to do in an emergency.</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {["Summarize the current situation", "An earthquake is happening, what should I do?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="text-xs rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user" ? "bg-slate-900 text-white rounded-br-none" : "bg-violet-50 text-slate-800 rounded-bl-none ring-1 ring-violet-100"
                }`}
              >
                {msg.content}
              </div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 w-full max-w-[90%]">
                  {msg.actions.map((action, j) => (
                    <button
                      key={j}
                      onClick={() => runAction(action)}
                      className="text-left text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 transition"
                    >
                      {actionLabel(action)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="text-xs text-slate-400 animate-pulse">AI is analyzing event data…</div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 ring-1 ring-red-200">{error}</div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-slate-100 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the situation or what to do…"
            className="field flex-1 text-sm"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
