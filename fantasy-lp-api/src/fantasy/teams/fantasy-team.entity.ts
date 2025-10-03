// src/fantasy/teams/fantasy-team.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyManager } from '../leagues/fantasy-manager.entity';

@Entity({ name: 'fantasy_team' })
export class FantasyTeam {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => FantasyManager, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'fantasy_manager_id' })
  fantasyManager: FantasyManager;

  @Column() name: string;

  @Column({ name: 'budget_remaining', type: 'bigint' }) budgetRemaining: string;
  @Column({ name: 'budget_reserved', type: 'bigint', default: '0' }) budgetReserved: string;

  @Column({ name: 'points_total', type: 'numeric', precision: 12, scale: 2, default: 0 })
  pointsTotal: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}