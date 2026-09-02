import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IdentityService } from "../modules/identity/identity.service";
import type { UserEntity } from "../modules/identity/entities/user.entity";
import { UnauthenticatedError, ForbiddenError } from "./errors";

const SESSION_COOKIE = "session_id";
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: UserEntity;
    currentSessionId?: string;
  }
}

export interface AuthPluginOptions {
  identityService: IdentityService;
  isProduction: boolean;
}

// Resolves the session cookie into request.currentUser on every request, and enforces
// CSRF token matching (against the server-side session record, not just cookie==header)
// on every state-changing request. See ADR-004 and docs/architecture/security-model.md.
export const authPlugin = fp(async (app: FastifyInstance, opts: AuthPluginOptions) => {
  app.decorateRequest("currentUser", undefined);
  app.decorateRequest("currentSessionId", undefined);

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (!sessionId) return;

    const resolved = await opts.identityService.resolveSession(sessionId);
    if (!resolved) return;

    if (MUTATING_METHODS.has(request.method)) {
      const csrfHeader = request.headers[CSRF_HEADER];
      if (typeof csrfHeader !== "string" || csrfHeader !== resolved.session.csrfSecret) {
        throw new ForbiddenError("Token de segurança (CSRF) ausente ou inválido");
      }
    }

    request.currentUser = resolved.user;
    request.currentSessionId = resolved.session.id;
  });

  app.decorate("requireAuth", (request: FastifyRequest): UserEntity => {
    if (!request.currentUser) {
      throw new UnauthenticatedError();
    }
    return request.currentUser;
  });

  app.decorate(
    "setSessionCookies",
    (reply: FastifyReply, sessionId: string, csrfSecret: string, expiresAt: Date) => {
      reply.setCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: opts.isProduction,
        sameSite: "lax",
        path: "/",
        expires: expiresAt
      });
      reply.setCookie(CSRF_COOKIE, csrfSecret, {
        httpOnly: false,
        secure: opts.isProduction,
        sameSite: "lax",
        path: "/",
        expires: expiresAt
      });
    }
  );

  app.decorate("clearSessionCookies", (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(CSRF_COOKIE, { path: "/" });
  });
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth(request: FastifyRequest): UserEntity;
    setSessionCookies(reply: FastifyReply, sessionId: string, csrfSecret: string, expiresAt: Date): void;
    clearSessionCookies(reply: FastifyReply): void;
  }
}
