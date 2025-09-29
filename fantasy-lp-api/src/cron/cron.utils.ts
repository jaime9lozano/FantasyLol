import { DataSource } from 'typeorm';

export class CronLock {
  constructor(private readonly ds: DataSource) {}

  /**
   * Usa pg_try_advisory_lock para evitar ejecuciones concurrentes del mismo job.
   * @returns true si se adquirió el lock, false si ya estaba tomado.
   */
  async tryLock(key: number): Promise<boolean> {
    const rows = await this.ds.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    return !!rows?.[0]?.locked;
  }

  async unlock(key: number): Promise<void> {
    await this.ds.query('SELECT pg_advisory_unlock($1)', [key]);
  }
}

export function nowUtc() {
  return new Date();
}

export function hoursAgoUtc(hours: number): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - hours);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function daysAgoUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function parseBoolEnv(name: string, def = false): boolean {
  const v = process.env[name];
  if (v == null) return def;
  return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
}

export function readCsvEnv(name: string): string[] {
  const v = process.env[name]?.trim();
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
}