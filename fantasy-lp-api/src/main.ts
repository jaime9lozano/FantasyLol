import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MarketGateway } from './fantasy/market/market.gateway';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Seguridad base (opt-in por ENV para no romper flujos locales)
  const enableCors = process.env.ENABLE_CORS?.toLowerCase() === 'true';
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  if (enableCors) {
    app.enableCors({ origin: corsOrigin === '*' ? true : corsOrigin.split(','), credentials: true });
  }
  if (process.env.ENABLE_HELMET?.toLowerCase() === 'true') {
    app.use(helmet());
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // elimina props no declaradas en DTOs
      forbidNonWhitelisted: false,
      transform: true,           // habilita transformaciones de tipos (class-transformer)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger (OpenAPI)
  const swaggerEnabled = process.env.ENABLE_SWAGGER?.toLowerCase() !== 'false';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Fantasy LP API')
      .setDescription('API para Fantasy LoL. Usa Authorize con Bearer JWT (access token).')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
  if (swaggerEnabled) logger.log(`Swagger UI: http://localhost:${port}/docs`);
  logger.log(
    `Flags -> AUTH:${process.env.ENABLE_AUTH||'false'} DEV_LOGIN:${process.env.ENABLE_DEV_LOGIN||'true'} CORS:${process.env.ENABLE_CORS||'true'} HELMET:${process.env.ENABLE_HELMET||'false'}`,
  );
  // Enlazar manejador de join.league para rooms
  try { app.get(MarketGateway).bindJoinHandler(); } catch {}
}
bootstrap();
