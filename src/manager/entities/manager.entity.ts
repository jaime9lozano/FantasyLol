import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'manager' })
@Index('idx_manager_username', ['username'])
@Index('idx_manager_email', ['email'])
export class Manager {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number; // Ojo con BigInt: si crece mucho, valora tiparlo como string

  @Column({ unique: true, type: 'text' })
  username: string;

  @Column({ unique: true, type: 'text' })
  email: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  password_hash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'eliminated', type: 'timestamptz', nullable: true })
  eliminated: Date | null;
}

