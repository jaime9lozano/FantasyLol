import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'game', schema: 'public'  })
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'leaguepedia_game_id' })
  leaguepediaGameId: string;

  @Column({ type: 'timestamptz', name: 'datetime_utc' })
  datetimeUtc: Date;

  @Column({ type: 'int', name: 'tournament_id', nullable: true })
  tournamentId: number | null;

  @Column({ type: 'text', name: 'tournament_name', nullable: true })
  tournamentName: string | null;

  @Column({ type: 'text', name: 'overview_page', nullable: true })
  overviewPage: string | null;

  @Column({ type: 'text', nullable: true })
  patch: string | null;

  @Column({ type: 'text', name: 'team1_text', nullable: true })
  team1Text: string | null;

  @Column({ type: 'text', name: 'team2_text', nullable: true })
  team2Text: string | null;

  @Column({ type: 'text', name: 'win_team_text', nullable: true })
  winTeamText: string | null;

  @Column({ type: 'text', name: 'loss_team_text', nullable: true })
  lossTeamText: string | null;

  @Column({ type: 'smallint', name: 'winner_number', nullable: true })
  winnerNumber: number | null; // 1 | 2

  @Column({ type: 'int', name: 'team1_id', nullable: true })
  team1Id: number | null;

  @Column({ type: 'int', name: 'team2_id', nullable: true })
  team2Id: number | null;

  @Column({ type: 'int', name: 'winner_team_id', nullable: true })
  winnerTeamId: number | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}