
import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EsportsLeague } from 'src/esports_league/entities/esports_league.entity';

@Entity({ name: 'equipo' })
export class Equipo {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'text' })
  team_name: string;

  @Column({ type: 'text', nullable: true })
  acronym?: string;

  @Column({ type: 'text', nullable: true })
  logo_url?: string;

  // 👇 Campos nuevos según tu SQL
  @Column({ type: 'text', nullable: true, unique: true })
  slug?: string;

  @Column({ type: 'text', nullable: true, unique: true })
  esports_team_id?: string;

  @Column({ type: 'text', nullable: true })
  league_id?: string;

  @ManyToOne(() => EsportsLeague, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'league_id' })
  league?: EsportsLeague;

  @Column({ type: 'text', nullable: true })
  location?: string;

  @Column({ type: 'bigint' })
  Region_id: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;
}


