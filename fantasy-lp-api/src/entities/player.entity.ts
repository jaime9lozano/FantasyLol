import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'player' })
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'leaguepedia_player_id', nullable: true })
  leaguepediaPlayerId: string | null; // Players.OverviewPage

  @Column({ type: 'text', name: 'display_name', nullable: true })
  displayName: string | null; // Players.ID (IGN)

  @Column({ type: 'text', nullable: true })
  country: string | null; // Players.NationalityPrimary

  @Column({ type: 'text', name: 'photo_file', nullable: true })
  photoFile: string | null;

  @Column({ type: 'text', name: 'photo_url', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}