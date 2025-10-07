import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'team_player_membership', schema: 'public'  })
export class TeamPlayerMembership {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'team_id' })
  teamId: number;

  @Column({ type: 'int', name: 'player_id' })
  playerId: number;

  @Column({ type: 'int', name: 'main_role_id', nullable: true })
  mainRoleId: number | null;

  @Column({ type: 'boolean', name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({ type: 'boolean', name: 'is_substitute', default: false })
  isSubstitute: boolean;

  @Column({ type: 'timestamptz', name: 'last_seen_utc', nullable: true })
  lastSeenUtc: Date | null;

  @Column({ type: 'timestamptz', name: 'first_seen_utc', nullable: true })
  firstSeenUtc: Date | null;

  @Column({ type: 'int', name: 'games_window', default: 0 })
  gamesWindow: number;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}
