// src/fantasy/offers/transfer-offer.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { Player } from 'src/entities/player.entity';

export type OfferStatus = 'PENDING'|'ACCEPTED'|'REJECTED'|'EXPIRED';

@Entity({ name: 'transfer_offer' })
export class TransferOffer {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_team_id' })
  fromTeam: FantasyTeam;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_team_id' })
  toTeam: FantasyTeam;

  @Column({ type: 'bigint' }) amount: string;

  @Column({ type: 'text', default: 'PENDING' }) status: OfferStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
