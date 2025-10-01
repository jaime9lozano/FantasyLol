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
// helpers/league.ts (o donde las tengas)
export function leagueAliases(codeOrLike: string): string[] {
  const raw = codeOrLike.trim();
  const key = raw.toUpperCase();

  const MAP: Record<string, string[]> = {
    LEC: ['LEC', 'LoL EMEA Championship', 'League of Legends EMEA Championship'],
    LCK: ['LCK', 'LoL Champions Korea', 'League of Legends Champions Korea'],
    LPL: ['LPL', 'Tencent LoL Pro League', 'LoL Pro League'],
  };

  // 1) Coincidencia exacta de la clave
  if (MAP[key]) {
    return [...MAP[key], raw];
  }

  // 2) Extraer "base code" dentro de cadenas tipo LCK21, LPL2020...
  const m = key.match(/\b(LEC|LCK|LPL)\b/);
  const base = m?.[1];

  const set = new Set<string>();
  if (base && MAP[base]) {
    MAP[base].forEach(a => set.add(a));
  }

  // 3) Añade siempre el literal que te pasaron (útil para LIKE)
  set.add(raw);

  return Array.from(set);
}

export function buildLeagueWhere(alias: string) {
  return `(T.Name LIKE "%${alias}%" OR T.League LIKE "%${alias}%")`;
}

export function looksLikeLeagueIconKey(input: string): boolean {
  const key = input.trim().toUpperCase();
  return /^(LEC|LCK|LPL)\d{2,4}$/.test(key);
}
