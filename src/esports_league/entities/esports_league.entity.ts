import { Entity, PrimaryColumn, Column, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'esports_league' })
export class EsportsLeague {
  @PrimaryColumn({ type: 'text' })
  id: string; // leagueId de LoL Esports API

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  region?: string;

  @Column({ type: 'text', nullable: true })
  image_url?: string;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;
}
