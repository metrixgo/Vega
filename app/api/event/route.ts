import { NextRequest, NextResponse } from "next/server";
import type { EventData, Student, Status, Notice } from "@/lib/types";

// Global in-memory cache for fast local access
const globalEvents = globalThis as unknown as {
  _vegaEvents?: Map<string, EventData>;
};

if (!globalEvents._vegaEvents) {
  globalEvents._vegaEvents = new Map<string, EventData>();
}

const events = globalEvents._vegaEvents;

// Helper to find student index by ID, phone, or name
function findStudentIndex(students: Student[], query: { id?: number; phone?: string; name?: string }): number {
  if (query.id) {
    const idx = students.findIndex((s) => s.id === query.id);
    if (idx >= 0) return idx;
  }
  if (query.phone && query.phone.trim()) {
    const idx = students.findIndex((s) => s.phone.trim() === query.phone?.trim());
    if (idx >= 0) return idx;
  }
  if (query.name && query.name.trim()) {
    const clean = query.name.trim().toLowerCase();
    const idx = students.findIndex((s) => s.name.trim().toLowerCase() === clean);
    if (idx >= 0) return idx;
  }
  return -1;
}

// Helper to merge student arrays without losing participants
function mergeStudents(existing: Student[], incoming: Student[]): Student[] {
  const mergedMap = new Map<string, Student>();

  for (const s of existing) {
    const key = s.id ? `id_${s.id}` : s.phone ? `phone_${s.phone}` : `name_${s.name.toLowerCase()}`;
    mergedMap.set(key, s);
  }

  for (const s of incoming) {
    const key = s.id ? `id_${s.id}` : s.phone ? `phone_${s.phone}` : `name_${s.name.toLowerCase()}`;
    const prev = mergedMap.get(key);
    if (prev) {
      mergedMap.set(key, {
        ...prev,
        ...s,
        // Preserve phone/name if incoming is empty
        name: s.name || prev.name,
        phone: s.phone || prev.phone,
        location: s.location || prev.location,
        lastSeen: s.lastSeen || "Just now",
      });
    } else {
      mergedMap.set(key, s);
    }
  }

  return Array.from(mergedMap.values());
}

// Helper to fetch/sync from persistent cloud storage
async function fetchCloudEvent(code: string): Promise<EventData | null> {
  try {
    const res = await fetch(`https://api.restful-api.dev/objects`, { cache: "no-store" });
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items)) return null;

    const match = items.find((item: { name?: string }) => item.name === `VEGA_EVENT_${code}`);
    if (match && match.data) {
      const existingInMemory = events.get(code);

      const cloudStudents: Student[] = match.data.students || [];
      const combinedStudents = existingInMemory ? mergeStudents(cloudStudents, existingInMemory.students) : cloudStudents;

      const data: EventData = {
        code,
        students: combinedStudents,
        notices: match.data.notices || (existingInMemory ? existingInMemory.notices : []),
        emergency: match.data.emergency !== undefined ? match.data.emergency : existingInMemory ? existingInMemory.emergency : null,
        updatedAt: Math.max(match.data.updatedAt || 0, existingInMemory?.updatedAt || Date.now()),
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
  if (!event || Date.now() - event.updatedAt > 4000) {
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
    const { action, code: rawCode, studentId, studentName, name, phone, location, status, issue, text } = body;
    const code = (rawCode || "VEGA-MAIN").toUpperCase();

    let event = events.get(code);
    if (!event) {
      event = (await fetchCloudEvent(code)) || getOrCreateEvent(code);
    }

    event.updatedAt = Date.now();

    const targetName = name || studentName || "";
    const targetPhone = phone || "";
    const targetId = typeof studentId === "number" ? studentId : undefined;

    if (action === "create") {
      event.students = [];
      event.notices = [];
      event.emergency = null;
    } else if (action === "join") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      const studentLoc: [number, number] = location || [37.7749, -122.4194];

      if (idx >= 0) {
        event.students[idx] = {
          ...event.students[idx],
          name: targetName || event.students[idx].name,
          phone: targetPhone || event.students[idx].phone,
          location: studentLoc,
          lastSeen: "Just now",
        };
      } else {
        const newStudent: Student = {
          id: targetId || Date.now() + Math.floor(Math.random() * 1000),
          name: targetName || "Anonymous Participant",
          phone: targetPhone,
          status: "Unchecked",
          location: studentLoc,
          lastSeen: "Just now",
        };
        event.students.push(newStudent);
      }
    } else if (action === "update_status") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      const studentLoc: [number, number] = location || [37.7749, -122.4194];

      if (idx >= 0) {
        event.students[idx].status = status || event.students[idx].status;
        event.students[idx].issue = issue !== undefined ? issue : event.students[idx].issue;
        if (location) event.students[idx].location = location;
        event.students[idx].lastSeen = "Just now";
      } else {
        // Robust Upsert: If student not found on status update, create them so they are NEVER lost
        event.students.push({
          id: targetId || Date.now() + Math.floor(Math.random() * 1000),
          name: targetName || "Participant",
          phone: targetPhone,
          status: status || "Unchecked",
          issue,
          location: studentLoc,
          lastSeen: "Just now",
        });
      }
    } else if (action === "update_location") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      const studentLoc: [number, number] = location || [37.7749, -122.4194];

      if (idx >= 0) {
        if (location) event.students[idx].location = location;
        event.students[idx].lastSeen = "Just now";
      } else {
        // Robust Upsert: If student not found on GPS update, add them immediately!
        event.students.push({
          id: targetId || Date.now() + Math.floor(Math.random() * 1000),
          name: targetName || "Participant",
          phone: targetPhone,
          status: "Unchecked",
          location: studentLoc,
          lastSeen: "Just now",
        });
      }
    } else if (action === "notice") {
      if (text) {
        const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        event.notices.unshift({ id: Date.now(), text, time: timeStr });
      }
    } else if (action === "emergency") {
      event.emergency = text || null;
    } else if (action === "clear_emergency") {
      event.emergency = null;
    } else if (action === "mark_safe") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      if (idx >= 0) {
        event.students[idx].status = "Safe";
        event.students[idx].issue = undefined;
        event.students[idx].lastSeen = "Just now";
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
