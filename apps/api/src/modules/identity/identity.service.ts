import { DataSource, IsNull, LessThan, MoreThan } from "typeorm";
import { UserEntity } from "./entities/user.entity";
import { OtpChallengeEntity } from "./entities/otp-challenge.entity";
import { SessionEntity } from "./entities/session.entity";
import type { OtpSender } from "./otp-sender";
import { generateNumericCode, generateToken, hashSecret, verifySecret } from "../../shared/crypto";
import { RateLimitedError, ValidationError } from "../../shared/errors";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/; // E.164

export interface AuthResult {
  user: UserEntity;
  sessionId: string;
  csrfSecret: string;
  sessionExpiresAt: Date;
}

export class IdentityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly otpSender: OtpSender
  ) {}

  async requestOtp(phone: string, requestIp: string): Promise<void> {
    if (!PHONE_PATTERN.test(phone)) {
      throw new ValidationError("Telefone deve estar no formato internacional, ex: +5511999998888");
    }

    const challenges = this.dataSource.getRepository(OtpChallengeEntity);

    // Rate limit per phone AND per IP independently — see security-model.md.
    const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MS);
    const [byPhone, byIp] = await Promise.all([
      challenges.count({ where: { phone, createdAt: MoreThan(windowStart) } }),
      challenges.count({ where: { requestIp, createdAt: MoreThan(windowStart) } })
    ]);
    if (byPhone >= OTP_MAX_REQUESTS_PER_WINDOW || byIp >= OTP_MAX_REQUESTS_PER_WINDOW * 3) {
      throw new RateLimitedError();
    }

    const code = generateNumericCode(6);
    const challenge = challenges.create({
      phone,
      requestIp,
      codeHash: hashSecret(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      consumedAt: null
    });
    await challenges.save(challenge);

    // Never log the code itself outside the dev console sender.
    await this.otpSender.send(phone, code);
  }

  async verifyOtp(phone: string, code: string, displayName: string | undefined): Promise<AuthResult> {
    // The failed-attempt increment below must survive even though the request itself
    // is rejected — it deliberately runs outside the transaction used for the success
    // path, so a thrown ValidationError/RateLimitedError never rolls it back (a bug
    // caught by test/integration/otp-auth.test.ts's lockout test).
    const challenges = this.dataSource.getRepository(OtpChallengeEntity);
    const challenge = await challenges.findOne({
      where: { phone, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: "DESC" }
    });

    if (!challenge) {
      throw new ValidationError("Código inválido ou expirado");
    }
    if (challenge.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new RateLimitedError("Muitas tentativas incorretas — solicite um novo código");
    }

    const isValid = verifySecret(code, challenge.codeHash);
    if (!isValid) {
      challenge.attempts += 1;
      await challenges.save(challenge);
      throw new ValidationError("Código inválido ou expirado");
    }

    return this.dataSource.transaction(async (manager) => {
      const txChallenges = manager.getRepository(OtpChallengeEntity);
      challenge.consumedAt = new Date();
      await txChallenges.save(challenge);

      const users = manager.getRepository(UserEntity);
      let user = await users.findOne({ where: { phone } });
      if (!user) {
        user = users.create({ phone, displayName: displayName?.trim() || "Vendedor" });
        await users.save(user);
      }

      const sessions = manager.getRepository(SessionEntity);
      const csrfSecret = generateToken(24);
      const session = sessions.create({
        userId: user.id,
        csrfSecret,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      });
      await sessions.save(session);

      return { user, sessionId: session.id, csrfSecret, sessionExpiresAt: session.expiresAt };
    });
  }

  async resolveSession(sessionId: string): Promise<{ session: SessionEntity; user: UserEntity } | null> {
    const sessions = this.dataSource.getRepository(SessionEntity);
    const session = await sessions.findOne({ where: { id: sessionId, expiresAt: MoreThan(new Date()) } });
    if (!session) return null;

    const users = this.dataSource.getRepository(UserEntity);
    const user = await users.findOne({ where: { id: session.userId } });
    if (!user) return null;

    return { session, user };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.dataSource.getRepository(SessionEntity).delete({ id: sessionId });
  }

  async purgeExpiredSessions(): Promise<void> {
    await this.dataSource.getRepository(SessionEntity).delete({ expiresAt: LessThan(new Date()) });
  }
}
