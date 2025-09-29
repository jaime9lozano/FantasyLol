export type CanonicalRole = 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT';

const ROLE_MAP: Record<string, CanonicalRole> = {
  top: 'TOP', toplane: 'TOP',
  jungle: 'JUNGLE', jg: 'JUNGLE',
  mid: 'MID', middle: 'MID', midlane: 'MID',
  bot: 'ADC', bottom: 'ADC', adc: 'ADC', carry: 'ADC', marksman: 'ADC',
  support: 'SUPPORT', sup: 'SUPPORT',
};

export function normalizeRole(raw?: string | null): CanonicalRole | null {
  if (!raw) return null;
  const key = raw.replace(/[^a-z]/gi, '').toLowerCase();
  return ROLE_MAP[key] ?? null;
}

export function toBoolYN(v?: string | null): boolean | null {
  if (v == null) return null;
  if (v.toLowerCase() === 'yes') return true;
  if (v.toLowerCase() === 'no') return false;
  return null;
}

export function toInt(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toUtcDate(dateTimeUtc: string): Date {
  // Convierte "YYYY-MM-DD HH:mm:ss" (UTC) a ISO para Date
  return new Date(dateTimeUtc.replace(' ', 'T') + 'Z');
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function arr<T>(v?: T[] | T): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}