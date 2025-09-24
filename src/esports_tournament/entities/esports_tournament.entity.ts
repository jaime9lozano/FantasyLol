import { Entity, PrimaryColumn, Column, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EsportsLeague } from 'src/esports_league/entities/esports_league.entity';

@Entity({ name: 'esports_tournament' })
export class EsportsTournament {
  @PrimaryColumn({ type: 'text' })
  id: string; // tournamentId

  @Column({ type: 'text', nullable: true })
  slug?: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'timestamptz', nullable: true })
  start_date?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  end_date?: Date;

  @Column({ type: 'text', nullable: true })
  status?: string;

  @Column({ type: 'text' })
  league_id: string;

  @ManyToOne(() => EsportsLeague, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league: EsportsLeague;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;
}
