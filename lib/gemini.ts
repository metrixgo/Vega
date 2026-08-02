import type { EventData, Student } from "@/lib/types";

export type AiAction = {
  type: "broadcast_emergency" | "send_notice" | "request_check_in";
  emergencyType?: string;
  message: string;
  title?: string;
};

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: AiAction[];
};

function buildEventContext(event: EventData, students: Student[]) {
  const safe = students.filter((s) => s.status === "Safe").length;
  const needsHelp = students.filter((s) => s.status === "Needs help");
  const unchecked = students.filter((s) => s.status === "Unchecked").length;

  return {
    event: {
      code: event.code,
      name: event.name,
      description: event.description,
      category: event.category,
      maxParticipants: event.maxParticipants,
      activeEmergency: event.emergency,
      activeCheckIn: event.checkInRequest,
      recentNotices: (event.notices || []).slice(0, 5),
    },
    summary: {
      totalParticipants: students.length,
      safe,
      needsHelp: needsHelp.length,
      unchecked,
      inDanger: needsHelp.length > 0 || !!event.emergency,
    },
    participants: students.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      status: s.status,
      issue: s.issue,
      location: s.location,
      lastSeen: s.lastSeen,
      checkedInAt: s.checkedInAt,
    })),
    participantsNeedingHelp: needsHelp.map((s) => ({
      name: s.name,
      issue: s.issue,
      status: s.status,
    })),
  };
}

const SYSTEM_PROMPT = `You are Vega AI, a safety assistant for event organizers managing group safety check-ins.

You receive live event data including all participants, their GPS locations, statuses (Safe, Needs help, Unchecked), issues, check-in requests, announcements, and any active emergency.

Respond to the organizer's questions with clear, actionable safety guidance. When asked for a situation summary, report: total participants, how many are safe, unchecked, or need help, whether anyone is in danger, and any active emergency or check-in.

When the organizer describes a crisis (earthquake, fire, storm, etc.) or asks what to do, recommend concrete steps and include actionable buttons when appropriate. If the situation clearly requires an emergency broadcast, return a broadcast_emergency action with the right emergencyType and a full message. If the organizer asks for a general announcement, return a send_notice action. If they want a group check-in, return a request_check_in action.

You MUST respond with valid JSON only, no markdown:
{
  "reply": "Your conversational response to the organizer",
  "actions": [
    {
      "type": "broadcast_emergency",
      "emergencyType": "Earthquake",
      "message": "Full emergency alert text to broadcast to all participants"
    }
  ]
}

Action types:
- "broadcast_emergency": use when organizer should declare an emergency. Set emergencyType (e.g. Earthquake, Fire, Typhoon / Severe Storm, Active Threat / Gunshots, Chaotic Evacuation, or custom). Set message to the full alert text.
- "send_notice": use for non-emergency announcements. Set message.
- "request_check_in": use to prompt all participants to check in. Set title and message.

Include actions[] only when a one-click action would help. Omit actions or use empty array for informational replies only.`;

export async function askGemini(
  apiKey: string,
  userMessage: string,
  event: EventData,
  students: Student[],
  history: AiMessage[] = []
): Promise<AiMessage> {
  const context = buildEventContext(event, students);

  const conversation = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Organizer" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}

CURRENT EVENT DATA:
${JSON.stringify(context, null, 2)}

${conversation ? `RECENT CONVERSATION:\n${conversation}\n\n` : ""}Organizer: ${userMessage}

Respond with JSON only.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || "Gemini API request failed");
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("No response from Gemini");

  let parsed: { reply?: string; actions?: AiAction[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { role: "assistant", content: raw };
  }

  return {
    role: "assistant",
    content: parsed.reply || raw,
    actions: parsed.actions?.filter((a) => a.message && a.type) || [],
  };
}
