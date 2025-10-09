import { INestApplication, Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { Roles } from '../../src/auth/roles.decorator';
import { RolesGuard } from '../../src/auth/roles.guard';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { resetFantasyDb } from 'test/helpers/db';

@Controller('admin-only')
class AdminTestController {
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  hello() { return { ok: true }; }
}

describe('Auth register/login E2E', () => {
  let app: INestApplication; let ds: DataSource;

  beforeAll(async () => {
    process.env.ENABLE_AUTH = 'true';
    const mod = await Test.createTestingModule({
      imports: [TestAppModule],
      controllers: [AdminTestController],
      providers: [RolesGuard],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    await resetFantasyDb(ds);
  });

  afterAll(async () => { await app.close(); });

  it('permite registrar y loguear, y protege ruta admin', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/auth/register')
      .send({ displayName: 'Juan', email: 'juan@example.com', password: 'secret' })
      .expect(201);
    expect(reg.body.access_token).toBeTruthy();

    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'juan@example.com', password: 'secret' })
      .expect(201);
    const token = login.body.access_token as string;

    await request(server).get('/admin-only').set('Authorization', `Bearer ${token}`).expect(403);

    // registrar admin sólo si ALLOW_REGISTER_ADMIN=true
    process.env.ALLOW_REGISTER_ADMIN = 'true';
    const regAdmin = await request(server)
      .post('/auth/register')
      .send({ displayName: 'Admin', email: 'admin@example.com', password: 'secret', role: 'admin' })
      .expect(201);
    const adminToken = regAdmin.body.access_token as string;
    await request(server).get('/admin-only').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });
});
