import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'role', schema: 'public'  })
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  code: string; // 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'

  @Column({ type: 'text', nullable: true })
  name: string | null;
}