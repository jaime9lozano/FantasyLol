// src/fantasy/scoring/fantasy-team-points.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyScoringPeriod } from './fantasy-scoring-period.entity';

@Entity({ name: 'fantasy_team_points' })
@Unique(['fantasyLeague', 'fantasyTeam', 'fantasyScoringPeriod'])
export class FantasyTeamPoints {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam: FantasyTeam;

  @ManyToOne(() => FantasyScoringPeriod)
  @JoinColumn({ name: 'fantasy_scoring_period_id' })
  fantasyScoringPeriod: FantasyScoringPeriod;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) points: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}