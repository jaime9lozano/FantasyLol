import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Jugador } from './entities/jugador.entity';
import { JugadorService } from './jugador.service';
import { JugadorController } from './jugador.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  
imports: [
    TypeOrmModule.forFeature([Jugador]),
    HttpModule,
  ],
  controllers: [JugadorController],
  providers: [JugadorService],
  exports: [JugadorService],
})
export class JugadorModule {}
