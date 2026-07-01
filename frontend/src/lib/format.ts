export function fmtToken(raw: number | string | bigint, decimals = 18, digits = 3): string {
  try {
    const big =
      typeof raw === "bigint"
        ? raw
        : BigInt(typeof raw === "number" ? Math.trunc(raw).toString() : raw);
    const base = 10n ** BigInt(decimals);
    const whole = big / base;
    const frac = big % base;
    const fracStr = (frac + base).toString().slice(1).padEnd(decimals, "0").slice(0, digits);
    return `${whole.toString()}${digits > 0 ? "." + fracStr : ""}`;
  } catch {
    return String(raw);
  }
}

function parseBackendTime(iso: string): Date {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return parseBackendTime(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function elapsedString(
  startIso: string | null | undefined,
  nowMs: number,
  endIso?: string | null,
): string {
  if (!startIso) return "00:00";
  const start = parseBackendTime(startIso).getTime();
  const end = endIso ? parseBackendTime(endIso).getTime() : nowMs;
  const s = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function elapsedMinutes(
  startIso: string | null | undefined,
  nowMs: number,
  endIso?: string | null,
): number {
  if (!startIso) return 0;
  const end = endIso ? parseBackendTime(endIso).getTime() : nowMs;
  return Math.max(0, (end - parseBackendTime(startIso).getTime()) / 60000);
}

export function isOnChainHash(h: string | null | undefined): boolean {
  return !!h && h.startsWith("0x");
}
