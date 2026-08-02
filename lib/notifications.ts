// Helper for Native Browser Push Notifications, Service Workers & Audio/Vibration Alerts

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      return reg;
    } catch (err) {
      console.error("Service worker registration error:", err);
    }
  }
  return null;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      registerServiceWorker();
      return true;
    }
    return false;
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

export async function triggerNotification(title: string, options?: NotificationOptions, type: "emergency" | "notice" | "help" = "notice") {
  // Always trigger sound & vibration
  playAlertSound(type);
  vibrateDevice(type === "emergency" ? [400, 150, 400, 150, 400] : [200, 100, 200]);

  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.showNotification(title, {
            icon: "/images/logo.png",
            badge: "/favicon.ico",
            tag: type === "emergency" ? "emergency-alert" : "notice-alert",
            ...options,
          });
          return;
        }
      }

      // Fallback for browsers without active service worker registration
      new Notification(title, {
        icon: "/images/logo.png",
        badge: "/favicon.ico",
        ...options,
      });
    } catch (err) {
      console.error("Trigger notification error:", err);
    }
  }
}
