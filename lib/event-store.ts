import fs from "fs";
import path from "path";
import os from "os";
import { kv } from "@vercel/kv";
import type { EventData } from "@/lib/types";

const REDIS_KEY = "vega_events";
const globalEvents = globalThis as unknown as {
  _vegaEvents?: Map<string, EventData>;
  _vegaLoadedAt?: number;
};

const CACHE_MS = 2000;

function getFilePath(): string {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    return path.join(dataDir, "vega_events.json");
  } catch {
    return path.join(os.tmpdir(), "vega_events.json");
  }
}

async function loadFromRedis(): Promise<Record<string, EventData> | null> {
  try {
    const data = await kv.get<Record<string, EventData>>(REDIS_KEY);
    if (!data) return {};
    return data;
  } catch (err) {
    console.error("Redis load error:", err);
    return null;
  }
}

async function saveToRedis(obj: Record<string, EventData>): Promise<boolean> {
  try {
    await kv.set(REDIS_KEY, obj);
    return true;
  } catch (err) {
    console.error("Redis save error:", err);
    return false;
  }
}

function loadFromFile(): Record<string, EventData> {
  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error("File load error:", err);
    return {};
  }
}

function saveToFile(obj: Record<string, EventData>) {
  try {
    const filePath = getFilePath();
    const temp = `${filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(obj, null, 2), "utf-8");
    fs.renameSync(temp, filePath);
  } catch (err) {
    console.error("File save error:", err);
  }
}

function toMap(obj: Record<string, EventData>): Map<string, EventData> {
  const map = new Map<string, EventData>();
  for (const [code, data] of Object.entries(obj)) {
    map.set(code.toString().trim(), { ...data, code: code.toString().trim() });
  }
  return map;
}

function toObject(map: Map<string, EventData>): Record<string, EventData> {
  const obj: Record<string, EventData> = {};
  for (const [code, data] of map.entries()) obj[code] = data;
  return obj;
}

export async function loadEvents(force = false): Promise<Map<string, EventData>> {
  const now = Date.now();
  if (!force && globalEvents._vegaEvents && globalEvents._vegaLoadedAt && now - globalEvents._vegaLoadedAt < CACHE_MS) {
    return globalEvents._vegaEvents;
  }

  const fromRedis = await loadFromRedis();
  const obj = fromRedis ?? loadFromFile();
  const map = toMap(obj);
  globalEvents._vegaEvents = map;
  globalEvents._vegaLoadedAt = now;
  return map;
}

export async function saveEvents(map: Map<string, EventData>): Promise<void> {
  const obj = toObject(map);
  globalEvents._vegaEvents = map;
  globalEvents._vegaLoadedAt = Date.now();

  const savedRedis = await saveToRedis(obj);
  if (!savedRedis) saveToFile(obj);
}

export function normalizeCode(raw: string): string {
  return raw.toString().trim();
}
