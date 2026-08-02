import { NextRequest, NextResponse } from "next/server";

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

export type EventData = {
  code: string;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  updatedAt: number;
  cloudObjectId?: string;
};

// Global in-memory cache for fast local access
const globalEvents = globalThis as unknown as {
  _vegaEvents?: Map<string, EventData>;
};

if (!globalEvents._vegaEvents) {
  globalEvents._vegaEvents = new Map<string, EventData>();
}

const events = globalEvents._vegaEvents;

// Helper to fetch/sync from persistent cloud storage (restful-api.dev object store)
async function fetchCloudEvent(code: string): Promise<EventData | null> {
  try {
    const res = await fetch(`https://api.restful-api.dev/objects`, { cache: "no-store" });
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items)) return null;

    const match = items.find((item: { name?: string }) => item.name === `VEGA_EVENT_${code}`);
    if (match && match.data) {
      const data: EventData = {
        code,
        students: match.data.students || [],
        notices: match.data.notices || [],
        emergency: match.data.emergency || null,
        updatedAt: match.data.updatedAt || Date.now(),
        cloudObjectId: match.id,
      };
      events.set(code, data);
      return data;
    }
  } catch (err) {
    console.error("Cloud fetch error:", err);
  }
  return null;
}

async function saveCloudEvent(data: EventData): Promise<void> {
  try {
    const payload = {
      name: `VEGA_EVENT_${data.code}`,
      data: {
        code: data.code,
        students: data.students,
        notices: data.notices,
        emergency: data.emergency,
        updatedAt: data.updatedAt,
      },
    };

    if (data.cloudObjectId) {
      await fetch(`https://api.restful-api.dev/objects/${data.cloudObjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } else {
      const res = await fetch(`https://api.restful-api.dev/objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (res.ok) {
        const created = await res.json();
        data.cloudObjectId = created.id;
      }
    }
  } catch (err) {
    console.error("Cloud save error:", err);
  }
}

function getOrCreateEvent(code: string): EventData {
  let event = events.get(code);
  if (!event) {
    event = {
      code,
      students: [],
      notices: [],
      emergency: null,
      updatedAt: Date.now(),
    };
    events.set(code, event);
  }
  return event;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") || "VEGA-MAIN").toUpperCase();

  let event = events.get(code);
  // Try cloud fetch if missing or older than 5s
  if (!event || Date.now() - event.updatedAt > 5000) {
    const cloudData = await fetchCloudEvent(code);
    if (cloudData) {
      event = cloudData;
    } else if (!event) {
      event = getOrCreateEvent(code);
    }
  }

  return NextResponse.json(event);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, code: rawCode } = body;
    const code = (rawCode || "VEGA-MAIN").toUpperCase();

    let event = events.get(code);
    if (!event) {
      event = (await fetchCloudEvent(code)) || getOrCreateEvent(code);
    }

    event.updatedAt = Date.now();

    if (action === "create") {
      event.students = [];
      event.notices = [];
      event.emergency = null;
    } else if (action === "join") {
      const { name, phone, location } = body;
      const existingIndex = event.students.findIndex((s) => s.name.toLowerCase() === (name || "").toLowerCase() || s.phone === phone);
      const studentLoc: [number, number] = location || [37.7749, -122.4194];

      if (existingIndex >= 0) {
        event.students[existingIndex] = {
          ...event.students[existingIndex],
          phone: phone || event.students[existingIndex].phone,
          location: studentLoc,
          lastSeen: "Just now",
        };
      } else {
        const newStudent: Student = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          name: name || "Anonymous Participant",
          phone: phone || "",
          status: "Unchecked",
          location: studentLoc,
          lastSeen: "Just now",
        };
        event.students.push(newStudent);
      }
    } else if (action === "update_status") {
      const { studentName, phone, status, issue, location } = body;
      const index = event.students.findIndex((s) => s.name.toLowerCase() === (studentName || "").toLowerCase() || (phone && s.phone === phone));
      if (index >= 0) {
        event.students[index].status = status;
        event.students[index].issue = issue || undefined;
        event.students[index].lastSeen = "Just now";
        if (location) event.students[index].location = location;
      }
    } else if (action === "update_location") {
      const { studentName, phone, location } = body;
      const index = event.students.findIndex((s) => s.name.toLowerCase() === (studentName || "").toLowerCase() || (phone && s.phone === phone));
      if (index >= 0 && location) {
        event.students[index].location = location;
        event.students[index].lastSeen = "Just now";
      }
    } else if (action === "notice") {
      const { text } = body;
      if (text) {
        const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        event.notices.unshift({ id: Date.now(), text, time: timeStr });
      }
    } else if (action === "emergency") {
      const { text } = body;
      event.emergency = text || null;
    } else if (action === "clear_emergency") {
      event.emergency = null;
    } else if (action === "mark_safe") {
      const { studentId } = body;
      const index = event.students.findIndex((s) => s.id === studentId);
      if (index >= 0) {
        event.students[index].status = "Safe";
        event.students[index].issue = undefined;
        event.students[index].lastSeen = "Just now";
      }
    } else if (action === "reset") {
      event.students = [];
      event.notices = [];
      event.emergency = null;
    } else if (action === "delete") {
      events.delete(code);
      if (event.cloudObjectId) {
        fetch(`https://api.restful-api.dev/objects/${event.cloudObjectId}`, { method: "DELETE" }).catch(() => {});
      }
      return NextResponse.json({ success: true, deleted: code });
    }

    events.set(code, event);

    // Save to persistent cloud store asynchronously
    saveCloudEvent(event);

    return NextResponse.json(event);
  } catch (error) {
    console.error("API POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 400 });
  }
}
