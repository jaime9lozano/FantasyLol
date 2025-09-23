import { Region } from 'src/region/entities/region.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'equipo' })
export class Equipo {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;

  @Column({ type: 'text' })
  team_name: string;

  @Column({ type: 'text' })
  acronym: string;

  @Column({ type: 'text' })
  logo_url: string;

  @Column({ type: 'text' })
  location: string;

  @Column({ type: 'date', nullable: true })
  founded_year: string | null;

  @Column({ type: 'text', nullable: true })
  coach_name: string | null;

  @ManyToOne(() => Region)
  @JoinColumn({ name: 'Region_id' })
  region: Region;

  @Column({ type: 'bigint' })
  Region_id: number;
}

