import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from 'src/entities/game.entity';
import { League } from 'src/entities/league.entity';
import { PlayerGameStats } from 'src/entities/player-game-stats.entity';
import { Player } from 'src/entities/player.entity';
import { Role } from 'src/entities/role.entity';
import { TeamPlayerMembership } from 'src/entities/team-player-membership.entity';
import { Team } from 'src/entities/team.entity';
import { Tournament } from 'src/entities/tournament.entity';
import { FantasyLeague } from 'src/fantasy/leagues/fantasy-league.entity';
import { FantasyManager } from 'src/fantasy/leagues/fantasy-manager.entity';
import { MarketBid } from 'src/fantasy/market/market-bid.entity';
import { MarketOrder } from 'src/fantasy/market/market-order.entity';
import { TransferOffer } from 'src/fantasy/offers/transfer-offer.entity';
import { TransferTransaction } from 'src/fantasy/offers/transfer-transaction.entity';
import { FantasyPlayerPoints } from 'src/fantasy/scoring/fantasy-player-points.entity';
import { FantasyScoringPeriod } from 'src/fantasy/scoring/fantasy-scoring-period.entity';
import { FantasyTeamPoints } from 'src/fantasy/scoring/fantasy-team-points.entity';
import { FantasyRosterSlot } from 'src/fantasy/teams/fantasy-roster-slot.entity';
import { FantasyTeam } from 'src/fantasy/teams/fantasy-team.entity';
import { FantasyPlayerValuation } from 'src/fantasy/valuation/fantasy-player-valuation.entity';


@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('DATABASE_URL');
        if (!url) throw new Error('DATABASE_URL is not defined');

        return {
          type: 'postgres',
          url,
          schema: 'public',                                // ⬅️ siempre public
          synchronize: false,
          logging: ['error'],
          ssl: { rejectUnauthorized: false },              // Supabase pooler
          extra: { options: `-c search_path=public` },     // ⬅️ search_path fijo a public
          entities: [
            // Core
            League, Tournament, Role, Team, Player, Game, PlayerGameStats, TeamPlayerMembership,
            // Fantasy (en prod/desa viven en public)
            FantasyManager, FantasyLeague, FantasyTeam, FantasyRosterSlot,
            MarketOrder, MarketBid,
            TransferOffer, TransferTransaction,
            FantasyScoringPeriod, FantasyPlayerPoints, FantasyTeamPoints,
            FantasyPlayerValuation,
          ],
        };
      },
    }),
  ],
})
export class DatabaseModule {}