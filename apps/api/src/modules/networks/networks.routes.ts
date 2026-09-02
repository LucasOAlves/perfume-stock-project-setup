import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { NetworksService } from "./networks.service";
import { CAPABILITIES } from "./entities/capability";

const createNetworkSchema = z.object({ name: z.string().min(2).max(120) });
const acceptInviteSchema = z.object({ code: z.string().min(10).max(80) });
const networkParamsSchema = z.object({ networkId: z.string().uuid() });
const memberParamsSchema = z.object({ networkId: z.string().uuid(), membershipId: z.string().uuid() });
// Deliberately built from CAPABILITIES, which excludes member.manage/permission.manage —
// this schema is the first of two independent structural blocks against self-escalation
// (the second is NetworksService.setMemberCapabilities re-validating the same list).
const setCapabilitiesSchema = z.object({ capabilities: z.array(z.enum(CAPABILITIES)) });

export function registerNetworksRoutes(app: FastifyInstance, networksService: NetworksService): void {
  app.post("/networks", async (request, reply) => {
    const user = app.requireAuth(request);
    const { name } = createNetworkSchema.parse(request.body);
    const network = await networksService.createNetwork(user.id, name);
    reply.code(201).send({ network });
  });

  app.get("/networks", async (request, reply) => {
    const user = app.requireAuth(request);
    const networks = await networksService.listMyNetworks(user.id);
    reply.send({ networks: networks.map(({ network, isOwner }) => ({ ...network, isOwner })) });
  });

  app.post("/networks/:networkId/invites", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const invite = await networksService.createInvite(user.id, networkId);
    reply.code(201).send({ invite: { code: invite.code, expiresAt: invite.expiresAt } });
  });

  app.post("/invites/accept", async (request, reply) => {
    const user = app.requireAuth(request);
    const { code } = acceptInviteSchema.parse(request.body);
    const network = await networksService.acceptInvite(user.id, code);
    reply.send({ network });
  });

  app.get("/networks/:networkId/members", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const members = await networksService.listMembers(user.id, networkId);
    reply.send({
      members: members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        isOwner: m.isOwner,
        createdAt: m.createdAt
      }))
    });
  });

  app.get("/networks/:networkId/members/:membershipId/capabilities", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, membershipId } = memberParamsSchema.parse(request.params);
    const capabilities = await networksService.getMemberCapabilities(user.id, networkId, membershipId);
    reply.send({ capabilities });
  });

  app.put("/networks/:networkId/members/:membershipId/capabilities", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, membershipId } = memberParamsSchema.parse(request.params);
    const { capabilities } = setCapabilitiesSchema.parse(request.body);
    const updated = await networksService.setMemberCapabilities(user.id, networkId, membershipId, capabilities);
    reply.send({ capabilities: updated });
  });
}
