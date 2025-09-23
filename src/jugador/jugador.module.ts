import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Jugador } from './entities/jugador.entity';
import { JugadorService } from './jugador.service';
import { JugadorController } from './jugador.controller';
import { RiotService } from 'src/riot/riot.service';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Region } from 'src/region/entities/region.entity';
import { Rol } from 'src/rol/entities/rol.entity';
import { HttpModule } from '@nestjs/axios';

@Module({
  
imports: [
    TypeOrmModule.forFeature([Jugador, Equipo, Region, Rol]),
    HttpModule,
  ],
  controllers: [JugadorController],
  providers: [JugadorService, RiotService],
  exports: [JugadorService],
})
export class JugadorModule {}
