// src/fantasy/scoring/fantasy-scoring-period.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';

@Entity({ name: 'fantasy_scoring_period' })
export class FantasyScoringPeriod {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @Column() name: string;

  @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt: Date;
  @Column({ name: 'ends_at', type: 'timestamptz' }) endsAt: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}