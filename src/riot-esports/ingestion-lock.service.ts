// src/riot-esports/ingestion-lock.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class IngestionLockService {
  private running = false;

  isRunning() {
    return this.running;
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }
}