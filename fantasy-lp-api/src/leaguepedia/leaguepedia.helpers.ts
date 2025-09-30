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

// utils/league-alias.ts
export function leagueAliases(codeOrLike: string): string[] {
  const key = codeOrLike.toUpperCase().trim();
  const MAP: Record<string, string[]> = {
    LEC: ['LEC', 'LoL EMEA Championship'],
    LCK: ['LCK', 'League of Legends Champions Korea'],
    LPL: ['LPL', 'League of Legends Pro League'],
    LCS: ['LCS', 'League Championship Series'],
  };
  // Si te pasan ya el nombre largo o algo custom, añade el propio like como alias
  return [...(MAP[key] ?? []), codeOrLike];
}

export function buildLeagueWhere(alias: string) {
  // construye (T.Name LIKE "%alias%" OR T.League LIKE "%alias%")
  return `(T.Name LIKE "%${alias}%" OR T.League LIKE "%${alias}%")`;
}