import fs from "fs";
import path from "path";
import os from "os";
// @ts-ignore
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "BVTUC4fG2u0T3RToMoJ7Dl1kJOytXJ1Zx0632m-W9aM";

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@vega-safety.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type SubscriptionStore = Record<string, PushSubscriptionJSON[]>;

const globalPush = globalThis as unknown as {
  _vegaPushSubs?: SubscriptionStore;
  _vegaPushLoaded?: boolean;
};

if (!globalPush._vegaPushSubs) {
  globalPush._vegaPushSubs = {};
}

const subscriptions = globalPush._vegaPushSubs;

function getStoragePath(): string {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, "vega_push_subscriptions.json");
  } catch {
    return path.join(os.tmpdir(), "vega_push_subscriptions.json");
  }
}

function loadSubscriptions() {
  if (globalPush._vegaPushLoaded) return;
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const parsed: SubscriptionStore = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      for (const [code, subs] of Object.entries(parsed)) {
        subscriptions[code] = subs;
      }
    }
  } catch (err) {
    console.error("Failed to load push subscriptions:", err);
  } finally {
    globalPush._vegaPushLoaded = true;
  }
}

function saveSubscriptions() {
  try {
    fs.writeFileSync(getStoragePath(), JSON.stringify(subscriptions, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save push subscriptions:", err);
  }
}

export function addPushSubscription(eventCode: string, sub: PushSubscriptionJSON) {
  loadSubscriptions();
  const code = eventCode.toUpperCase();
  if (!subscriptions[code]) subscriptions[code] = [];
  const exists = subscriptions[code].some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subscriptions[code].push(sub);
    saveSubscriptions();
  }
}

export function removePushSubscription(eventCode: string, endpoint: string) {
  loadSubscriptions();
  const code = eventCode.toUpperCase();
  if (!subscriptions[code]) return;
  subscriptions[code] = subscriptions[code].filter((s) => s.endpoint !== endpoint);
  saveSubscriptions();
}

export async function sendPushToEvent(
  eventCode: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  loadSubscriptions();
  const code = eventCode.toUpperCase();
  const subs = subscriptions[code] || [];
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || `/participant/event/${code}`,
    tag: payload.tag || "vega-announcement",
  });

  const stale: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, data);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        }
      }
    })
  );

  if (stale.length > 0) {
    subscriptions[code] = subscriptions[code].filter((s) => !stale.includes(s.endpoint));
    saveSubscriptions();
  }
}
