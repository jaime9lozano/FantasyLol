import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'region' })
@Index('idx_region_name', ['name'])
export class Region {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number; 
  
  @Column({ unique: true, type: 'text' })
  name: string;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'eliminated' })
  eliminated: Date | null;
}


