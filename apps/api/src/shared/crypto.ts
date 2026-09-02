import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function generateNumericCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

const SCRYPT_KEY_LENGTH = 64;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, SCRYPT_KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(secret, salt, SCRYPT_KEY_LENGTH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
