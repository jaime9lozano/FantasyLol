import { Module } from '@nestjs/common';
import { EsportsTournamentService } from './esports_tournament.service';
import { EsportsTournamentController } from './esports_tournament.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsportsTournament } from './entities/esports_tournament.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EsportsTournament]),],
  controllers: [EsportsTournamentController],
  providers: [EsportsTournamentService],
  exports: [EsportsTournamentService],
})
export class EsportsTournamentModule {}
