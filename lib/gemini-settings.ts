const GEMINI_KEY_STORAGE = "vega_gemini_api_key";

export function getGeminiApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GEMINI_KEY_STORAGE) || "";
}

export function setGeminiApiKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0;
}
