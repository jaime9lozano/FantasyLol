import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'fantasy_budget_ledger' })
@Index(['fantasyLeagueId','fantasyTeamId'])
export class FantasyBudgetLedger {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'fantasy_league_id', type: 'int' }) fantasyLeagueId: number;
  @Column({ name: 'fantasy_team_id', type: 'int' }) fantasyTeamId: number;
  @Column({ type: 'text' }) type: string; // REWARD_PERIOD | CLAUSE_PAYMENT | MANUAL_ADJUST | etc.
  @Column({ type: 'bigint' }) delta: string; // negativo o positivo
  @Column({ name: 'balance_after', type: 'bigint' }) balanceAfter: string;
  @Column({ name: 'ref_id', type: 'int', nullable: true }) refId?: number;
  @Column({ type: 'jsonb', default: () => `'{}'` }) metadata: Record<string, any>;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
