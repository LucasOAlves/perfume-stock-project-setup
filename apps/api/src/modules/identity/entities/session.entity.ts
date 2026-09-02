import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Server-side session store — the session cookie only carries this row's id.
// Enables revocation, unlike a self-contained JWT. See ADR-004.
@Entity({ name: "sessions" })
export class SessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_sessions_user_id")
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @Column({ type: "varchar", length: 100, name: "csrf_secret" })
  csrfSecret!: string;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
