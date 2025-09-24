import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Region } from 'src/region/entities/region.entity';
import { Rol } from 'src/rol/entities/rol.entity';

@Entity({ name: 'jugador' })
export class Jugador {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: true, unique: true })
  summoner_id?: string;

  @Column({ type: 'uuid', nullable: true, unique: true })
  puuid?: string;

  @Column({ type: 'text', nullable: true, unique: true })
  summoner_name?: string;

  @Column({ type: 'text', nullable: true, unique: true })
  account_id?: string;

  @Column({ type: 'text', nullable: true })
  tier?: string;

  @Column({ type: 'int', nullable: true })
  league_points?: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  last_update: Date;

  @Column({ type: 'bigint' })
  team_id: number;

  @Column({ type: 'bigint' })
  Region_id: number;

  @Column({ type: 'bigint' })
  Main_role_id: number;

  @Column({ type: 'numeric', default: 0 })
  clausula: number;

  @Column({ type: 'text', nullable: true, unique: true })
  esports_player_id?: string;

  @Column({ type: 'text', nullable: true })
  display_name?: string;

  @Column({ type: 'text', nullable: true })
  country?: string;

  @Column({ type: 'text', nullable: true })
  photo_url?: string;

  @Column({ type: 'text', nullable: true })
  role_esports?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;

  @ManyToOne(() => Equipo)
  @JoinColumn({ name: 'team_id' })
  equipo: Equipo;

  @ManyToOne(() => Region)
  @JoinColumn({ name: 'Region_id' })
  region: Region;

  @ManyToOne(() => Rol)
  @JoinColumn({ name: 'Main_role_id' })
  rol: Rol;
}


