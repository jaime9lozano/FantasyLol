// src/fantasy/teams/fantasy-roster-slot.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from './fantasy-team.entity';
import { Player } from 'src/entities/player.entity';

@Entity({ name: 'fantasy_roster_slot' })
@Index('idx_roster_league_player_active', ['fantasyLeague', 'player', 'active'])
@Index('idx_roster_league_team_active', ['fantasyLeague', 'fantasyTeam', 'active'])
@Index('idx_roster_validity', ['validFrom', 'validTo'])
export class FantasyRosterSlot {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam: FantasyTeam;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Column() slot: 'TOP'|'JNG'|'MID'|'ADC'|'SUP'|'BENCH';

  @Column({ default: true }) starter: boolean;
  @Column({ default: true }) active: boolean;

  @Column({ name: 'acquisition_price', type: 'bigint', default: '0' }) acquisitionPrice: string;
  @Column({ name: 'clause_value', type: 'bigint', default: '0' }) clauseValue: string;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil?: Date;

  @Column({ name: 'valid_from', type: 'timestamptz', default: () => 'now()' }) validFrom: Date;
  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true }) validTo?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
