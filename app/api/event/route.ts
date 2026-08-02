import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { normalizeEventCode, isValidEventCode } from "@/lib/event-codes";
import { sendPushToEvent } from "@/lib/push-server";
import type { EventData, Student, Notice, CheckInRequest } from "@/lib/types";

const globalEvents = globalThis as unknown as {
  _vegaEvents?: Map<string, EventData>;
  _vegaDiskLoaded?: boolean;
};

if (!globalEvents._vegaEvents) {
  globalEvents._vegaEvents = new Map<string, EventData>();
}

const events = globalEvents._vegaEvents;

/** Only the explicit delete action may mark an event as deleted. */
const PARTICIPANT_ACTIONS = new Set([
  "join",
  "leave",
  "update_status",
  "update_location",
  "confirm_check_in",
  "dismiss_emergency",
]);

function getStoragePath(): string {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, "vega_events.json");
  } catch {
    return path.join(os.tmpdir(), "vega_events.json");
  }
}

function loadDiskEvents() {
  if (globalEvents._vegaDiskLoaded) return;
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed: Record<string, EventData> = JSON.parse(raw);
      for (const [code, data] of Object.entries(parsed)) {
        const normalized = normalizeEventCode(code);
        events.set(normalized, { ...data, code: normalized });
      }
    }
  } catch (err) {
    console.error("Failed to load disk events:", err);
  } finally {
    globalEvents._vegaDiskLoaded = true;
  }
}

function saveDiskEvents() {
  try {
    const filePath = getStoragePath();
    const obj: Record<string, EventData> = {};
    for (const [code, data] of events.entries()) {
      obj[code] = data;
    }
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save disk events:", err);
  }
}

function generateUniqueCode(): string {
  let attempts = 0;
  while (attempts < 100) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = events.get(code);
    if (!existing || existing.deleted) return code;
    attempts++;
  }
  return String(Date.now()).slice(-4);
}

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

export async function GET(request: NextRequest) {
  loadDiskEvents();
  const { searchParams } = new URL(request.url);
  const code = normalizeEventCode(searchParams.get("code") || "");

  if (!code || !isValidEventCode(code)) {
    return NextResponse.json({ error: "Invalid event code format." }, { status: 400 });
  }

  const event = events.get(code);

  if (!event) {
    return NextResponse.json({ error: "Event code does not exist.", exists: false }, { status: 404 });
  }

  if (event.deleted) {
    return NextResponse.json({ error: "Event has been deleted.", deleted: true }, { status: 404 });
  }

  return NextResponse.json(event);
}

export async function POST(request: NextRequest) {
  loadDiskEvents();
  try {
    const body = await request.json();
    const {
      action,
      code: rawCode,
      name: eventName,
      description: eventDesc,
      category: eventCat,
      maxParticipants: eventMax,
      studentId,
      studentName,
      name,
      phone,
      location,
      status,
      issue,
      text,
      checkInTitle,
      scheduledTime,
      eventData,
    } = body;

    const code = normalizeEventCode(rawCode || "");
    let event: EventData | null | undefined = events.get(code);

    // Participant actions must never delete an event
    if (PARTICIPANT_ACTIONS.has(action) && event?.deleted) {
      return NextResponse.json({ error: "Event has been deleted.", deleted: true }, { status: 404 });
    }

    // Action: RESTORE (organizer-only recovery — never restore deleted events)
    if (action === "restore" && eventData) {
      if (event?.deleted) {
        return NextResponse.json({ error: "Event has been deleted.", deleted: true }, { status: 404 });
      }
      if (!eventData.deleted && !event) {
        event = {
          code,
          name: eventData.name || "Group Safety Event",
          description: eventData.description || "",
          category: eventData.category || "General",
          maxParticipants: eventData.maxParticipants || 20,
          students: mergeStudents([], eventData.students || []),
          notices: eventData.notices || [],
          emergency: eventData.emergency || null,
          checkInRequest: eventData.checkInRequest || null,
          deleted: false,
          updatedAt: Date.now(),
        };
        events.set(code, event);
        saveDiskEvents();
      }
      return NextResponse.json(event || { error: "Nothing to restore" });
    }

    // Action: CREATE
    if (action === "create") {
      const newCode = code && isValidEventCode(code) ? code : generateUniqueCode();
      if (events.get(newCode) && !events.get(newCode)?.deleted) {
        return NextResponse.json({ error: "Event code already in use. Please try again." }, { status: 409 });
      }

      event = {
        code: newCode,
        name: eventName || "Group Safety Event",
        description: eventDesc || "",
        category: eventCat || "General",
        maxParticipants: typeof eventMax === "number" ? eventMax : 20,
        students: [],
        notices: [],
        emergency: null,
        checkInRequest: null,
        deleted: false,
        updatedAt: Date.now(),
      };
      events.set(newCode, event);
      saveDiskEvents();
      return NextResponse.json(event);
    }

    if (!event || event.deleted) {
      return NextResponse.json({ error: "Invalid Event Code. Event does not exist.", deleted: !!event?.deleted }, { status: 404 });
    }

    event.updatedAt = Date.now();

    const targetName = name || studentName || "";
    const targetPhone = phone || "";
    const targetId = typeof studentId === "number" ? studentId : undefined;

    if (action === "join") {
      const existingIdx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      if (existingIdx < 0 && event.maxParticipants && event.students.length >= event.maxParticipants) {
        return NextResponse.json(
          { error: `Event has reached maximum capacity of ${event.maxParticipants} participants.` },
          { status: 400 }
        );
      }

      const studentLoc: [number, number] = location || [37.7749, -122.4194];

      if (existingIdx >= 0) {
        event.students[existingIdx] = {
          ...event.students[existingIdx],
          name: targetName || event.students[existingIdx].name,
          phone: targetPhone || event.students[existingIdx].phone,
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
    } else if (action === "leave") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      if (idx >= 0) {
        event.students.splice(idx, 1);
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
        event.students.push({
          id: targetId || Date.now() + Math.floor(Math.random() * 1000),
          name: targetName || "Participant",
          phone: targetPhone,
          status: "Unchecked",
          location: studentLoc,
          lastSeen: "Just now",
        });
      }
    } else if (action === "trigger_check_in") {
      event.students = event.students.map((s) => ({
        ...s,
        status: "Unchecked",
        checkedInAt: undefined,
        issue: undefined,
      }));

      const req: CheckInRequest = {
        id: Date.now(),
        title: checkInTitle || "Instant Safety Check-In",
        scheduledTime: scheduledTime || undefined,
        createdAt: Date.now(),
        active: true,
      };
      event.checkInRequest = req;
    } else if (action === "confirm_check_in") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (idx >= 0) {
        event.students[idx].status = "Safe";
        event.students[idx].issue = undefined;
        event.students[idx].checkedInAt = timeStr;
        event.students[idx].lastSeen = "Just now";
      }
    } else if (action === "clear_check_in") {
      event.checkInRequest = null;
    } else if (action === "notice") {
      if (text) {
        const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        event.notices.unshift({ id: Date.now(), text, time: timeStr });

        sendPushToEvent(code, {
          title: "📢 Announcement from Organizer",
          body: text,
          url: `/participant/event/${code}`,
          tag: `announcement-${code}`,
        }).catch((err) => console.error("Push send error:", err));
      }
    } else if (action === "emergency") {
      event.emergency = text || null;
    } else if (action === "dismiss_emergency") {
      // Participant-only: mark themselves safe without clearing the global emergency
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      if (idx >= 0) {
        event.students[idx].status = "Safe";
        event.students[idx].issue = undefined;
        event.students[idx].lastSeen = "Just now";
      }
    } else if (action === "clear_emergency") {
      // Organizer-only: clears the global emergency alert for all participants
      event.emergency = null;
    } else if (action === "mark_safe") {
      const idx = findStudentIndex(event.students, { id: targetId, phone: targetPhone, name: targetName });
      if (idx >= 0) {
        event.students[idx].status = "Safe";
        event.students[idx].issue = undefined;
        event.students[idx].checkedInAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        event.students[idx].lastSeen = "Just now";
      }
    } else if (action === "reset") {
      event.students = [];
      event.notices = [];
      event.emergency = null;
      event.checkInRequest = null;
    } else if (action === "delete") {
      event.deleted = true;
      event.students = [];
      event.notices = [];
      event.emergency = null;
      event.checkInRequest = null;
      events.set(code, event);
      saveDiskEvents();
      return NextResponse.json({ success: true, deleted: true, code });
    }

    // Safety guard: participant actions must never leave the event in a deleted state
    if (PARTICIPANT_ACTIONS.has(action)) {
      event.deleted = false;
    }

    events.set(code, event);
    saveDiskEvents();

    return NextResponse.json(event);
  } catch (error) {
    console.error("API POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 400 });
  }
}
