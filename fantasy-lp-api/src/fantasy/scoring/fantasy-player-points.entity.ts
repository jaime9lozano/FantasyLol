// src/fantasy/scoring/fantasy-player-points.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { Player } from 'src/entities/player.entity';
import { Game } from 'src/entities/game.entity';

@Entity({ name: 'fantasy_player_points' })
@Unique(['fantasyLeague', 'player', 'game'])
export class FantasyPlayerPoints {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @ManyToOne(() => Game)
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @Column({ type: 'numeric', precision: 8, scale: 2 }) points: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
