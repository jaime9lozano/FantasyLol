import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  get() {
    // Podríamos añadir checks de DB/WS en el futuro
    return { status: 'ok', uptime: process.uptime() };
  }
}
