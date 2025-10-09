// src/fantasy/leagues/fantasy-manager.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'fantasy_manager' })
export class FantasyManager {
  @PrimaryGeneratedColumn() id: number;

  @Column({ name: 'display_name' }) displayName: string;

  @Index({ unique: true })
  @Column({ type: 'text', nullable: true }) email?: string | null;

  // Hash de contraseña (bcrypt). Opcional para compatibilidad con datos previos de tests.
  @Column({ name: 'password_hash', type: 'text', nullable: true }) passwordHash?: string | null;

  // Hash del refresh token actual (rotado en cada refresh/login). Opcional.
  @Column({ name: 'refresh_token_hash', type: 'text', nullable: true }) refreshTokenHash?: string | null;

  // Rol del usuario: 'manager' | 'admin' (o 'dev' desde dev-login)
  @Column({ type: 'text', default: 'manager', nullable: true }) role?: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}