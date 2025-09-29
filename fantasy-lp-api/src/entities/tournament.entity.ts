import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tournament' })
export class Tournament {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'overview_page' })
  overviewPage: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  league: string | null;

  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  @Column({ type: 'boolean', name: 'is_official', nullable: true })
  isOfficial: boolean | null;

  @Column({ type: 'date', name: 'date_start', nullable: true })
  dateStart: string | null;

  @Column({ type: 'date', name: 'date_end', nullable: true })
  dateEnd: string | null;

  @Column({ type: 'text', nullable: true })
  split: string | null;

  @Column({ type: 'text', name: 'tournament_level', nullable: true })
  tournamentLevel: string | null;

  @Column({ type: 'text', name: 'league_icon_key', nullable: true })
  leagueIconKey: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}