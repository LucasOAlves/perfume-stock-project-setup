import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// One row per OTP request. Never store the plain code — only its hash.
// See docs/architecture/security-model.md: OTP must never be logged or stored in plaintext.
@Entity({ name: "otp_challenges" })
export class OtpChallengeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_otp_challenges_phone")
  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "varchar", length: 45, name: "request_ip" })
  requestIp!: string;

  @Column({ type: "varchar", length: 200, name: "code_hash" })
  codeHash!: string;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", name: "consumed_at", nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
