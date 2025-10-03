// src/fantasy/offers/transfer-transaction.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { Player } from 'src/entities/player.entity';

export type TransferType = 'AUCTION_WIN'|'CLAUSE_PAID'|'OFFER_ACCEPTED'|'LISTING_SOLD';

@Entity({ name: 'transfer_transaction' })
export class TransferTransaction {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague)
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @ManyToOne(() => FantasyTeam, { nullable: true })
  @JoinColumn({ name: 'from_team_id' })
  fromTeam?: FantasyTeam;

  @ManyToOne(() => FantasyTeam, { nullable: true })
  @JoinColumn({ name: 'to_team_id' })
  toTeam?: FantasyTeam;

  @Column({ type: 'bigint' }) amount: string;

  @Column({ type: 'text' }) type: TransferType;

  @CreateDateColumn({ name: 'executed_at' }) executedAt: Date;
}