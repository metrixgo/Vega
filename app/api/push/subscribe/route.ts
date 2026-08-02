import { NextRequest, NextResponse } from "next/server";
import { normalizeEventCode } from "@/lib/event-codes";
import { addPushSubscription, removePushSubscription, type PushSubscriptionJSON } from "@/lib/push-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = normalizeEventCode(body.eventCode || "");
    const subscription = body.subscription as PushSubscriptionJSON | undefined;

    if (!code || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    addPushSubscription(code, subscription);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const code = normalizeEventCode(body.eventCode || "");
    const endpoint = body.endpoint as string | undefined;

    if (!code || !endpoint) {
      return NextResponse.json({ error: "Invalid unsubscribe payload" }, { status: 400 });
    }

    removePushSubscription(code, endpoint);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 400 });
  }
}
