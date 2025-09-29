import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'league' })
export class League {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  code: string | null;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'boolean', name: 'is_official', nullable: true })
  isOfficial: boolean | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'NOW()' })
  updatedAt: Date;
}