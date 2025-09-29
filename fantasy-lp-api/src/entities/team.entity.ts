import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'team' })
export class Team {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'league_id', nullable: true })
  leagueId: number | null;

  @Column({ type: 'text', name: 'leaguepedia_team_page', nullable: true })
  leaguepediaTeamPage: string | null; // Teams.OverviewPage

  @Column({ type: 'text', name: 'team_name' })
  teamName: string;

  @Column({ type: 'text', nullable: true })
  short: string | null;

  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'text', name: 'logo_file', nullable: true })
  logoFile: string | null;

  @Column({ type: 'text', name: 'logo_url', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}
