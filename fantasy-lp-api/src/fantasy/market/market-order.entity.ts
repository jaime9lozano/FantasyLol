// src/fantasy/market/market-order.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { Player } from 'src/entities/player.entity';
import { MarketBid } from './market-bid.entity';

export type OrderType = 'AUCTION'|'LISTING';
export type OrderStatus = 'OPEN'|'CLOSED'|'CANCELLED'|'SETTLED';

@Entity({ name: 'market_order' })
export class MarketOrder {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @ManyToOne(() => FantasyTeam, { nullable: true })
  @JoinColumn({ name: 'owner_team_id' })
  ownerTeam?: FantasyTeam; // null = agente libre

  @Column({ type: 'text' }) type: OrderType;
  @Column({ type: 'text', default: 'OPEN' }) status: OrderStatus;

  @Column({ name: 'min_price', type: 'bigint', default: '0' }) minPrice: string;

  @Column({ name: 'opens_at', type: 'timestamptz' }) opensAt: Date;
  @Column({ name: 'closes_at', type: 'timestamptz' }) closesAt: Date;

  @OneToMany(() => MarketBid, b => b.order) bids: MarketBid[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}