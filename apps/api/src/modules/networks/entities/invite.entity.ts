import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

// code is a high-entropy, single-use, expiring token — never a guessable/sequential id.
// See docs/architecture/security-model.md "Invitation / Linking".
@Entity({ name: "invites" })
@Unique("uq_invites_code", ["code"])
export class InviteEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_invites_network_id")
  @Column({ type: "uuid", name: "network_id" })
  networkId!: string;

  @Column({ type: "varchar", length: 64 })
  code!: string;

  @Column({ type: "uuid", name: "created_by_membership_id" })
  createdByMembershipId!: string;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", name: "used_at", nullable: true })
  usedAt!: Date | null;

  @Column({ type: "uuid", name: "used_by_user_id", nullable: true })
  usedByUserId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
