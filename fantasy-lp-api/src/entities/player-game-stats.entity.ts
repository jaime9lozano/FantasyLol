import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'player_game_stats', schema: 'public'  })
export class PlayerGameStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'game_id' })
  gameId: number;

  @Column({ type: 'int', name: 'player_id' })
  playerId: number;

  @Column({ type: 'text', name: 'player_page_text', nullable: true })
  playerPageText: string | null;

  @Column({ type: 'text', name: 'team_text', nullable: true })
  teamText: string | null;

  @Column({ type: 'text', nullable: true })
  role: string | null;

  @Column({ type: 'text', nullable: true })
  champion: string | null;

  @Column({ type: 'int', nullable: true })
  kills: number | null;

  @Column({ type: 'int', nullable: true })
  deaths: number | null;

  @Column({ type: 'int', nullable: true })
  assists: number | null;

  @Column({ type: 'int', nullable: true })
  gold: number | null;

  @Column({ type: 'int', nullable: true })
  cs: number | null;

  @Column({ type: 'int', name: 'damage_to_champions', nullable: true })
  damageToChampions: number | null;

  @Column({ type: 'int', name: 'vision_score', nullable: true })
  visionScore: number | null;

  @Column({ type: 'boolean', name: 'player_win', nullable: true })
  playerWin: boolean | null;

  @Column({ type: 'char', length: 1, nullable: true })
  result: string | null; // 'W' | 'L'

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}
