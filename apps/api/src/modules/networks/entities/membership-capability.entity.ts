import { Column, Entity, Index, PrimaryColumn } from "typeorm";
import type { Capability } from "./capability";

@Entity({ name: "membership_capabilities" })
export class MembershipCapabilityEntity {
  @PrimaryColumn({ type: "uuid", name: "membership_id" })
  @Index("idx_membership_capabilities_membership_id")
  membershipId!: string;

  @PrimaryColumn({ type: "varchar", length: 40 })
  capability!: Capability;
}
