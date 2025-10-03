// src/fantasy/leagues/fantasy-manager.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'fantasy_manager' })
export class FantasyManager {
  @PrimaryGeneratedColumn() id: number;

  @Column({ name: 'display_name' }) displayName: string;

  @Column({ nullable: true }) email?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}