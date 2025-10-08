// src/fantasy/leagues/fantasy-league.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FantasyManager } from './fantasy-manager.entity';

@Entity({ name: 'fantasy_league' })
export class FantasyLeague {
  @PrimaryGeneratedColumn() id: number;

  @Column() name: string;

  @Column({ name: 'invite_code', unique: true }) inviteCode: string;

  @ManyToOne(() => FantasyManager, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_manager_id' })
  adminManager: FantasyManager;

  @Column({ name: 'initial_budget', type: 'bigint', default: '100000000' })
  initialBudget: string;

  @Column({ name: 'clause_multiplier', type: 'numeric', precision: 5, scale: 2, default: 1.5 })
  clauseMultiplier: string;

  @Column({ name: 'market_close_time', type: 'time', default: '20:00' })
  marketCloseTime: string;

  @Column({ default: 'Europe/Madrid' }) timezone: string;

  @Column({ name: 'scoring_config', type: 'jsonb', default: {} })
  scoringConfig: Record<string, any>;

  @Column({ name: 'roster_config', type: 'jsonb', default: () => `'{"slots":["TOP","JNG","MID","ADC","SUP"],"bench":2}'` })
  rosterConfig: { slots: string[]; bench: number };

  // Código de la liga (ej: 'LEC','LCK','LPL') sobre la que se basa este fantasy.
  @Column({ name: 'source_league_code', type: 'text', nullable: true })
  sourceLeagueCode: string | null;

  // ID de la liga core (public.league.id) si existe correlación.
  @Column({ name: 'source_league_id', type: 'int', nullable: true })
  sourceLeagueId: number | null;

  // Torneo activo (tournament.id en public.tournament) que define el pool válido de jugadores/partidos.
  @Column({ name: 'source_tournament_id', type: 'int', nullable: true })
  sourceTournamentId: number | null;

  // Metadatos cacheados del torneo (para mostrar sin más joins). Valores opcionales.
  @Column({ name: 'source_tournament_name', type: 'text', nullable: true })
  sourceTournamentName: string | null;

  @Column({ name: 'source_tournament_overview', type: 'text', nullable: true })
  sourceTournamentOverview: string | null;

  @Column({ name: 'source_tournament_year', type: 'int', nullable: true })
  sourceTournamentYear: number | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}