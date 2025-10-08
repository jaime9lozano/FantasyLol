import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { MarketOrder } from './market-order.entity';

@Entity({ name: 'market_cycle' })
export class MarketCycle {
  @PrimaryGeneratedColumn() id: number;

  @ManyToOne(() => FantasyLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_league_id' })
  fantasyLeague: FantasyLeague;

  @Column({ name: 'opens_at', type: 'timestamptz' }) opensAt: Date;
  @Column({ name: 'closes_at', type: 'timestamptz' }) closesAt: Date;

  @OneToMany(() => MarketOrder, (o) => o.cycle)
  orders: MarketOrder[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
