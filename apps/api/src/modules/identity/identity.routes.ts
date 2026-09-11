import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { IdentityService } from "./identity.service";

const requestOtpSchema = z.object({ email: z.string().email().max(254) });
const verifyOtpSchema = z.object({
  email: z.string().email().max(254),
  code: z.string().length(6),
  displayName: z.string().min(1).max(120).optional()
});

export function registerIdentityRoutes(app: FastifyInstance, identityService: IdentityService): void {
  app.post("/auth/otp/request", async (request, reply) => {
    const { email } = requestOtpSchema.parse(request.body);
    await identityService.requestOtp(email, request.ip);
    reply.code(202).send({ ok: true });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const { email, code, displayName } = verifyOtpSchema.parse(request.body);
    const result = await identityService.verifyOtp(email, code, displayName);
    app.setSessionCookies(reply, result.sessionId, result.csrfSecret, result.sessionExpiresAt);
    reply.send({ user: { id: result.user.id, displayName: result.user.displayName } });
  });

  app.post("/auth/logout", async (request, reply) => {
    if (request.currentSessionId) {
      await identityService.revokeSession(request.currentSessionId);
    }
    app.clearSessionCookies(reply);
    reply.send({ ok: true });
  });

  app.get("/auth/me", async (request, reply) => {
    const user = app.requireAuth(request);
    reply.send({ user: { id: user.id, displayName: user.displayName } });
  });
}
