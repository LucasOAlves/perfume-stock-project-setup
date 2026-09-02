import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

export type MembershipStatus = "active" | "removed";

// Every protected query in the system ultimately depends on resolving one of these
// for (userId, networkId) — see docs/architecture/security-model.md tenant isolation rules.
@Entity({ name: "memberships" })
@Unique("uq_memberships_network_user", ["networkId", "userId"])
export class MembershipEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_memberships_network_id")
  @Column({ type: "uuid", name: "network_id" })
  networkId!: string;

  @Index("idx_memberships_user_id")
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  // Owner status is structurally separate from grantable capabilities (ADR-003) —
  // member.manage / permission.manage always require is_owner = true, never a capability grant.
  @Column({ type: "boolean", name: "is_owner", default: false })
  isOwner!: boolean;

  @Column({ type: "varchar", length: 20, default: "active" })
  status!: MembershipStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
