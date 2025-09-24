import { Module } from '@nestjs/common';
import { EsportsLeagueService } from './esports_league.service';
import { EsportsLeagueController } from './esports_league.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsportsLeague } from './entities/esports_league.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EsportsLeague]),],
  controllers: [EsportsLeagueController],
  providers: [EsportsLeagueService],
  exports: [EsportsLeagueService],
})
export class EsportsLeagueModule {}
