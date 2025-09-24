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
import { JugadorModule } from './jugador/jugador.module';
import { RiotEsportsService } from './riot-esports/riot-esports.service';
import { EsportsLeagueModule } from './esports_league/esports_league.module';
import { EsportsTournamentModule } from './esports_tournament/esports_tournament.module';
import { RiotEsportsModule } from './riot-esports/riot-esports.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    EsportsLeagueModule,
    EsportsTournamentModule,
    RiotEsportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
