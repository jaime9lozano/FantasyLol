// src/fantasy/valuation/fantasy-player-valuation.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { Player } from 'src/entities/player.entity';

@Entity({ name: 'fantasy_player_valuation' })
@Unique(['fantasyLeague','player'])
export class FantasyPlayerValuation {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Column({ name: 'current_value', type: 'bigint' }) currentValue: string;
  @Column({ name: 'last_change', type: 'bigint', default: '0' }) lastChange: string;
  @Column({ name: 'calc_date', type: 'date' }) calcDate: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
