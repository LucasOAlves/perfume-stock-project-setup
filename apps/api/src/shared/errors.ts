// Stable, typed application errors. Never let a raw error (stack trace, ORM/query text)
// reach the client — see docs/architecture/security-model.md "Data Handling / Logging".
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Autenticação necessária") {
    super("UNAUTHENTICATED", message, 401);
  }
}

// Used for both "no such network/resource" AND "not a member of this network" —
// deliberately the same response for both, so an attacker probing another network's
// resource ids cannot distinguish "doesn't exist" from "exists but isn't yours".
export class NotFoundError extends AppError {
  constructor(message = "Não encontrado") {
    super("NOT_FOUND", message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para fazer isso") {
    super("FORBIDDEN", message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Muitas tentativas, tente novamente mais tarde") {
    super("RATE_LIMITED", message, 429);
  }
}

// A required external dependency (e.g. the SMS provider) failed or is unreachable.
// Distinct from ValidationError: the request itself was fine, the failure is ours/theirs.
export class ExternalServiceError extends AppError {
  constructor(message = "Não foi possível completar a operação agora, tente novamente em instantes") {
    super("EXTERNAL_SERVICE_ERROR", message, 502);
  }
}
