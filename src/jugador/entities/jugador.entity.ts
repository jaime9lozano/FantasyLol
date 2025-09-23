import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Region } from 'src/region/entities/region.entity';
import { Rol } from 'src/rol/entities/rol.entity';

@Entity({ name: 'jugador' })
export class Jugador {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  eliminated: Date | null;

  @Column({ type: 'text', unique: true })
  summoner_id: string;

  @Column({ type: 'uuid', unique: true })
  puuid: string;

  @Column({ type: 'text', unique: true })
  summoner_name: string;

  @Column({ type: 'text', unique: true })
  account_id: string;

  @Column({ type: 'text', nullable: true })
  tier: string | null;

  @Column({ type: 'integer', nullable: true })
  league_points: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  last_update: Date;

  @ManyToOne(() => Equipo)
  @JoinColumn({ name: 'team_id' })
  equipo: Equipo;

  @Column({ type: 'bigint' })
  team_id: number;

  @ManyToOne(() => Region)
  @JoinColumn({ name: 'Region_id' })
  region: Region;

  @Column({ type: 'bigint' })
  Region_id: number;

  @ManyToOne(() => Rol)
  @JoinColumn({ name: 'Main_role_id' })
  main_role: Rol;

  @Column({ type: 'bigint' })
  Main_role_id: number;

  @Column({ type: 'numeric', default: 0 })
  clausula: number;
}

