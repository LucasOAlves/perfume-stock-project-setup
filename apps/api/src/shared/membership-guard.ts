import type { DataSource } from "typeorm";
import { MembershipEntity } from "../modules/networks/entities/membership.entity";
import { MembershipCapabilityEntity } from "../modules/networks/entities/membership-capability.entity";
import { CAPABILITY_LABELS, type Capability } from "../modules/networks/entities/capability";
import { ForbiddenError, NotFoundError } from "./errors";

export interface ResolvedMembership {
  membership: MembershipEntity;
  capabilities: Set<Capability>;
}

// THE core tenant-isolation primitive of the whole system (docs/architecture/security-model.md).
// networkId from the request is only ever used as a lookup key here — the result is
// always re-derived from the authenticated userId's own memberships, never trusted
// from the client directly. Every route touching network-owned data must call this
// (or requireCapability, below) before reading or writing anything.
export async function resolveMembership(
  dataSource: DataSource,
  userId: string,
  networkId: string
): Promise<ResolvedMembership> {
  const membership = await dataSource.getRepository(MembershipEntity).findOne({
    where: { userId, networkId, status: "active" }
  });

  // Same NotFoundError whether the network doesn't exist or the user just isn't a
  // member of it — deliberately indistinguishable to the caller (security-model.md).
  if (!membership) {
    throw new NotFoundError("Rede de vendas não encontrada");
  }

  if (membership.isOwner) {
    return { membership, capabilities: new Set() }; // owner bypasses capability checks entirely
  }

  const rows = await dataSource
    .getRepository(MembershipCapabilityEntity)
    .find({ where: { membershipId: membership.id } });

  return { membership, capabilities: new Set(rows.map((r) => r.capability)) };
}

export function hasCapability(resolved: ResolvedMembership, capability: Capability): boolean {
  return resolved.membership.isOwner || resolved.capabilities.has(capability);
}

export async function requireCapability(
  dataSource: DataSource,
  userId: string,
  networkId: string,
  capability: Capability
): Promise<ResolvedMembership> {
  const resolved = await resolveMembership(dataSource, userId, networkId);
  if (!hasCapability(resolved, capability)) {
    throw new ForbiddenError(`Permissão necessária: ${CAPABILITY_LABELS[capability]}`);
  }
  return resolved;
}

// member.manage / permission.manage are hardcoded to is_owner — see ADR-003. This is
// intentionally a separate function from requireCapability so it can never accidentally
// be satisfied by a capability grant.
export async function requireOwner(
  dataSource: DataSource,
  userId: string,
  networkId: string
): Promise<ResolvedMembership> {
  const resolved = await resolveMembership(dataSource, userId, networkId);
  if (!resolved.membership.isOwner) {
    throw new ForbiddenError("Somente o dono da rede pode fazer isso");
  }
  return resolved;
}
