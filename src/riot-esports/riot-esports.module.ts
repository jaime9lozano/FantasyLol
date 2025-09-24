import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiotEsportsService } from './riot-esports.service';
import { Equipo } from '../equipo/entities/equipo.entity';
import { Jugador } from '../jugador/entities/jugador.entity';
import { Rol } from '../rol/entities/rol.entity';
import { EsportsLeague } from 'src/esports_league/entities/esports_league.entity';
import { IngestionLockService } from './ingestion-lock.service';
import { RiotEsportsController } from './riot-esports.controller';
import { RiotEsportsTasks } from './riot-esports.tasks';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([EsportsLeague, Equipo, Jugador, Rol]),
  ],
  controllers: [RiotEsportsController],
  providers: [RiotEsportsService, RiotEsportsTasks, IngestionLockService],
  exports: [RiotEsportsService],
})
export class RiotEsportsModule {}
