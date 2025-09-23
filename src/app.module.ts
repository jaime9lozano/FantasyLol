import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ManagerModule } from './manager/manager.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { RegionModule } from './region/region.module';
import { EquipoModule } from './equipo/equipo.module';
import { RolModule } from './rol/rol.module';
import { HttpModule } from '@nestjs/axios';
import { RiotService } from './riot/riot.service';
import { JugadorModule } from './jugador/jugador.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        synchronize: false,
        autoLoadEntities: true,
        ssl: { rejectUnauthorized: false },
      }),
    }),
    ManagerModule,
    RegionModule,
    EquipoModule,
    RolModule,
    JugadorModule,
  ],
  controllers: [AppController],
  providers: [AppService, RiotService],
})
export class AppModule {}
