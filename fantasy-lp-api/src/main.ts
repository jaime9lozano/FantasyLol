import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MarketGateway } from './fantasy/market/market.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // elimina props no declaradas en DTOs
      forbidNonWhitelisted: false,
      transform: true,           // habilita transformaciones de tipos (class-transformer)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
  // Enlazar manejador de join.league para rooms
  try { app.get(MarketGateway).bindJoinHandler(); } catch {}
}
bootstrap();
