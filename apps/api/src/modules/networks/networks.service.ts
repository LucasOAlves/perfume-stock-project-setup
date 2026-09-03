import { DataSource, In, IsNull, MoreThan } from "typeorm";
import { SalesNetworkEntity } from "./entities/sales-network.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { MembershipCapabilityEntity } from "./entities/membership-capability.entity";
import { InviteEntity } from "./entities/invite.entity";
import { CAPABILITIES, DEFAULT_MEMBER_CAPABILITIES, type Capability } from "./entities/capability";
import { generateToken } from "../../shared/crypto";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import { requireOwner, resolveMembership } from "../../shared/membership-guard";
import { UserEntity } from "../identity/entities/user.entity";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class NetworksService {
  constructor(private readonly dataSource: DataSource) {}

  async createNetwork(userId: string, name: string): Promise<SalesNetworkEntity> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new ValidationError("O nome da rede deve ter pelo menos 2 caracteres");
    }

    return this.dataSource.transaction(async (manager) => {
      const network = manager.getRepository(SalesNetworkEntity).create({
        name: trimmed,
        createdByUserId: userId
      });
      await manager.getRepository(SalesNetworkEntity).save(network);

      const membership = manager.getRepository(MembershipEntity).create({
        networkId: network.id,
        userId,
        isOwner: true,
        status: "active"
      });
      await manager.getRepository(MembershipEntity).save(membership);

      return network;
    });
  }

  async listMyNetworks(userId: string): Promise<Array<{ network: SalesNetworkEntity; isOwner: boolean }>> {
    const memberships = await this.dataSource
      .getRepository(MembershipEntity)
      .find({ where: { userId, status: "active" } });
    if (memberships.length === 0) return [];

    const networks = await this.dataSource
      .getRepository(SalesNetworkEntity)
      .find({ where: { id: In(memberships.map((m) => m.networkId)) } });

    const networkById = new Map(networks.map((n) => [n.id, n]));
    return memberships
      .map((m) => ({ network: networkById.get(m.networkId), isOwner: m.isOwner }))
      .filter((entry): entry is { network: SalesNetworkEntity; isOwner: boolean } => Boolean(entry.network));
  }

  async createInvite(userId: string, networkId: string): Promise<InviteEntity> {
    const { membership } = await requireOwner(this.dataSource, userId, networkId);

    const invite = this.dataSource.getRepository(InviteEntity).create({
      networkId,
      code: generateToken(24),
      createdByMembershipId: membership.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      usedAt: null,
      usedByUserId: null
    });
    await this.dataSource.getRepository(InviteEntity).save(invite);
    return invite;
  }

  async acceptInvite(userId: string, code: string): Promise<SalesNetworkEntity> {
    return this.dataSource.transaction(async (manager) => {
      const invites = manager.getRepository(InviteEntity);
      // Same generic error whether the code never existed, expired, or was already
      // used — avoids leaking which case it is (security-model.md "Invitation / Linking").
      const invite = await invites.findOne({
        where: { code, usedAt: IsNull(), expiresAt: MoreThan(new Date()) }
      });
      if (!invite) {
        throw new ValidationError("Link de convite inválido ou expirado");
      }

      const memberships = manager.getRepository(MembershipEntity);
      const existing = await memberships.findOne({ where: { networkId: invite.networkId, userId } });
      if (existing) {
        throw new ConflictError("Você já é membro desta rede");
      }

      const membership = memberships.create({
        networkId: invite.networkId,
        userId,
        isOwner: false,
        status: "active"
      });
      await memberships.save(membership);

      const capabilities = manager.getRepository(MembershipCapabilityEntity);
      await capabilities.save(
        DEFAULT_MEMBER_CAPABILITIES.map((capability) =>
          capabilities.create({ membershipId: membership.id, capability })
        )
      );

      invite.usedAt = new Date();
      invite.usedByUserId = userId;
      await invites.save(invite);

      const network = await manager
        .getRepository(SalesNetworkEntity)
        .findOneOrFail({ where: { id: invite.networkId } });
      return network;
    });
  }

  // Only display names are exposed here, never phone numbers — phone stays visible
  // only to the account it belongs to (security-model.md "Authentication").
  async listMembers(userId: string, networkId: string) {
    await resolveMembership(this.dataSource, userId, networkId);

    const memberships = await this.dataSource
      .getRepository(MembershipEntity)
      .find({ where: { networkId, status: "active" }, order: { createdAt: "ASC" } });
    if (memberships.length === 0) return [];

    const users = await this.dataSource
      .getRepository(UserEntity)
      .find({ where: { id: In(memberships.map((m) => m.userId)) } });
    const nameByUserId = new Map(users.map((u) => [u.id, u.displayName]));

    return memberships.map((m) => ({ ...m, displayName: nameByUserId.get(m.userId) ?? "Vendedor" }));
  }

  // Owner-only visibility into a specific member's capability grants — deliberately not
  // exposed via the general listMembers() response (least disclosure by default; see
  // docs/architecture/security-model.md).
  async getMemberCapabilities(userId: string, networkId: string, membershipId: string): Promise<Capability[]> {
    await requireOwner(this.dataSource, userId, networkId);

    const target = await this.getGrantableMembership(networkId, membershipId);
    const rows = await this.dataSource
      .getRepository(MembershipCapabilityEntity)
      .find({ where: { membershipId: target.id } });
    return rows.map((r) => r.capability);
  }

  // The single path that can ever change a non-owner Membership's capabilities.
  // requireOwner() is the ENTIRE authorization check — there is no capability that can
  // ever satisfy it instead (ADR-003). `capabilities` is typed and validated (by the zod
  // schema in networks.routes.ts, and again structurally here via the Capability type)
  // against CAPABILITIES only, which does not and must never include member.manage or
  // permission.manage — so this endpoint cannot be used to grant itself, by construction.
  async setMemberCapabilities(
    userId: string,
    networkId: string,
    membershipId: string,
    capabilities: Capability[]
  ): Promise<Capability[]> {
    await requireOwner(this.dataSource, userId, networkId);

    const target = await this.getGrantableMembership(networkId, membershipId);
    const unique = [...new Set(capabilities)];
    const invalid = unique.filter((c) => !CAPABILITIES.includes(c));
    if (invalid.length > 0) {
      throw new ValidationError(`Permissão desconhecida: ${invalid.join(", ")}`);
    }

    return this.dataSource.transaction(async (manager) => {
      const capabilityRows = manager.getRepository(MembershipCapabilityEntity);
      await capabilityRows.delete({ membershipId: target.id });
      if (unique.length > 0) {
        await capabilityRows.save(
          unique.map((capability) => capabilityRows.create({ membershipId: target.id, capability }))
        );
      }
      return unique;
    });
  }

  // A Membership belonging to the network, that isn't the Owner (the Owner always has
  // every capability implicitly and holds no capability rows — see docs/product/domain-model.md).
  private async getGrantableMembership(networkId: string, membershipId: string): Promise<MembershipEntity> {
    const membership = await this.dataSource
      .getRepository(MembershipEntity)
      .findOne({ where: { id: membershipId, networkId, status: "active" } });
    if (!membership) {
      throw new NotFoundError("Membro não encontrado");
    }
    if (membership.isOwner) {
      throw new ValidationError(
        "As permissões do dono da rede não podem ser alteradas — ele sempre tem acesso completo"
      );
    }
    return membership;
  }
}
