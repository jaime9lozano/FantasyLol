// src/fantasy/market/market-bid.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { MarketOrder } from './market-order.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';

@Entity({ name: 'market_bid' })
export class MarketBid {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => MarketOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'market_order_id' })
  order: MarketOrder;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bidder_team_id' })
  bidderTeam: FantasyTeam;

  @Column({ type: 'bigint' }) amount: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}