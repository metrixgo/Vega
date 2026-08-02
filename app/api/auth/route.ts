import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/auth";

const globalUsers = globalThis as unknown as {
  _vegaUsers?: Map<string, User>;
};

if (!globalUsers._vegaUsers) {
  globalUsers._vegaUsers = new Map<string, User>();
}

const usersMap = globalUsers._vegaUsers;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const user = usersMap.get(email);
  return NextResponse.json({ user: user || null });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, user } = body;

    if (action === "save_user" && user && user.email) {
      usersMap.set(user.email.toLowerCase(), user);
      return NextResponse.json({ success: true, user });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Auth API error" }, { status: 500 });
  }
}
