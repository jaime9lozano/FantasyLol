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

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is not defined');
        }
        return {
          type: 'postgres',
          url,
          // IMPORTANT: no sincronizamos (usaremos migraciones / ya tienes DDL aplicado)
          synchronize: false,
          // Si quieres logging: 'all' | ['query','error'] | false
          logging: ['error'],
          entities: [
            League,
            Tournament,
            Role,
            Team,
            Player,
            Game,
            PlayerGameStats,
            TeamPlayerMembership,
          ],
        };
      },
    }),
  ],
})
export class DatabaseModule {}

