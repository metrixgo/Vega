/** Normalize event codes to 4-digit numeric strings (supports legacy VEGA-#### format). */
export function normalizeEventCode(raw: string): string {
  const trimmed = (raw || "").trim().toUpperCase();
  const digits = trimmed.replace(/^VEGA-/, "").replace(/\D/g, "");
  if (/^\d{4}$/.test(digits)) return digits;
  return trimmed;
}

export function isValidEventCode(code: string): boolean {
  return /^\d{4}$/.test(normalizeEventCode(code));
}

export function generateEventCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
