import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { ImageInfoResponse } from './dto/cargo.dto';
import { arr, sleep } from './leaguepedia.helpers';

const BASE_URL = 'https://lol.fandom.com/api.php';

export interface CargoQueryOptions {
  tables: string[] | string;
  fields: string[] | string;
  joinOn?: string[] | string;
  where?: string[] | string;
  groupBy?: string[] | string;
  orderBy?: string[] | string;
  limit?: number;   // 1..500
  offset?: number;  // paginación
  format?: 'json' | 'jsonfm';
}

@Injectable()
export class LeaguepediaClient {
  private readonly logger = new Logger(LeaguepediaClient.name);
  private readonly userAgent: string;

  constructor(private readonly http: HttpService) {
    this.userAgent = process.env.LEAGUEPEDIA_UA || 'FantasyLoL/1.0 (contacto: jaime@example.com)';
  }

  private join(v?: string[] | string): string | undefined {
    if (!v) return undefined;
    return Array.isArray(v) ? v.join(',') : v;
  }

  private async get<T>(params: Record<string, any>): Promise<T> {
    // Backoff simple con reintentos
    const maxRetries = 4;
    let attempt = 0;

    while (true) {
      try {
        const { data } = await firstValueFrom(
          this.http.get<T>(BASE_URL, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': this.userAgent,
            },
            params,
            timeout: 15000,
          }),
        );
        return data;
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries) {
          this.logger.error(`LP GET failed after ${maxRetries} retries`, err?.message);
          throw err;
        }
        const wait = 250 * attempt;
        this.logger.warn(`LP GET retry ${attempt}/${maxRetries} in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  async cargoQuery<T>(opts: CargoQueryOptions): Promise<T> {
    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
    return this.get<T>({
      action: 'cargoquery',
      format: opts.format ?? 'json',
      tables: this.join(opts.tables),
      fields: this.join(opts.fields),
      join_on: this.join(opts.joinOn),
      where: this.join(opts.where),
      group_by: this.join(opts.groupBy),
      order_by: this.join(opts.orderBy),
      limit,
      offset: opts.offset ?? 0,
    });
  }

  async cargoQueryAll<T>(opts: CargoQueryOptions & { maxPages?: number }): Promise<T[]> {
    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
    const maxPages = opts.maxPages ?? 20;
    const out: T[] = [];

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const res = await this.cargoQuery<{ cargoquery: Array<{ title: T }> }>({ ...opts, limit, offset }) as any;
      const chunk = res?.cargoquery?.map((x: any) => x.title as T) ?? [];
      out.push(...chunk);
      if (chunk.length < limit) break;
      await sleep(120);
    }
    return out;
  }

  /**
   * Resuelve URLs para títulos de imagen tipo "File:*.png/jpg".
   * Admite valores sin prefijo; añadimos "File:" automáticamente.
   */
  async resolveImageUrls(fileTitles: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const titles = arr(fileTitles)
      .filter(Boolean)
      .map((t) => (t.startsWith('File:') ? t : `File:${t}`));

    if (!titles.length) return result;

    // Lotes de 50
    for (let i = 0; i < titles.length; i += 50) {
      const group = titles.slice(i, i + 50);
      const data = await this.get<ImageInfoResponse>({
        action: 'query',
        format: 'json',
        titles: group.join('|'),
        prop: 'imageinfo',
        iiprop: 'url',
      });

      const pages = data?.query?.pages ?? {};
      Object.values<any>(pages).forEach((p) => {
        const infos = p?.imageinfo;
        const title = p?.title;
        if (title && Array.isArray(infos) && infos.length) {
          result[title] = infos[0].url;
        }
      });
      await sleep(120);
    }
    return result;
  }

  
/**
   * Resuelve la imagen principal de páginas (no File:) usando pageimages (original).
   * titles: nombres de página normales (p.ej. 'Caps', 'Hans Sama')
   * Retorna { 'Caps': 'https://.../file.jpg', ... }
   */
  async resolvePageOriginalImages(pageTitles: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const titles = Array.from(new Set(pageTitles.filter(Boolean)));
    if (!titles.length) return result;

    // Lotes de ~50 títulos
    for (let i = 0; i < titles.length; i += 50) {
      const group = titles.slice(i, i + 50);
      const data = await this.get<any>({
        action: 'query',
        format: 'json',
        prop: 'pageimages',
        piprop: 'original',
        titles: group.join('|'),
      });

      const pages = data?.query?.pages ?? {};
      Object.values<any>(pages).forEach((p) => {
        const title = p?.title;
        const src = p?.original?.source;
        if (title && src) result[title] = src;
      });
      await new Promise(r => setTimeout(r, 120));
    }
    return result;
  }
}
