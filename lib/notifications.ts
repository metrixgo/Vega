// Helper for Native Browser Notifications & Audio/Vibration Alerts

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

export function isNotificationGranted(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

export function playAlertSound(type: "emergency" | "notice" | "help" = "notice") {
  if (typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type === "emergency" ? "sawtooth" : type === "help" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(type === "emergency" ? 880 : type === "help" ? 660 : 440, ctx.currentTime);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === "emergency" ? 1.2 : 0.6));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (type === "emergency" ? 1.2 : 0.6));
  } catch (err) {
    console.error("Audio play error:", err);
  }
}

export function vibrateDevice(pattern: number[] = [200, 100, 200]) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

export function triggerNotification(title: string, options?: NotificationOptions, type: "emergency" | "notice" | "help" = "notice") {
  // Always trigger sound & vibration
  playAlertSound(type);
  vibrateDevice(type === "emergency" ? [400, 150, 400, 150, 400] : [200, 100, 200]);

  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        icon: "/images/logo.png",
        badge: "/favicon.ico",
        ...options,
      });
    } catch {
      /* ignore */
    }
  }
}
