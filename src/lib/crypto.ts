/**
 * Secret storage for provider connections.
 *
 * API keys and MCP tokens are written to Postgres encrypted with AES-256-GCM
 * under a key held only in the environment. Two consequences that are the
 * whole point:
 *
 *   - A database dump does not hand over the account. The ciphertext is
 *     useless without SETTINGS_ENCRYPTION_KEY.
 *   - GCM is authenticated, so a tampered row fails to decrypt rather than
 *     silently yielding a different value.
 *
 * If the key is absent this module throws instead of falling back to
 * plaintext. Storing a live API key unencrypted because configuration was
 * incomplete is the kind of default that is discovered far too late.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM's standard nonce length.

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "SETTINGS_ENCRYPTION_KEY is not set. Provider secrets are stored encrypted, " +
        "and this app will not fall back to writing them in plaintext. " +
        "Generate one with: openssl rand -base64 32",
    );
    this.name = "MissingEncryptionKeyError";
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();

  // Accept a 32-byte base64 key directly; hash anything else to 32 bytes so a
  // shorter passphrase is still usable rather than silently truncated.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}

export interface SealedSecret {
  cipher: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { cipher: encrypted, iv, tag: cipher.getAuthTag() };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), sealed.iv);
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.cipher), decipher.final()]).toString("utf8");
}

/** Last four characters, so a stored key is recognisable without being readable. */
export function hint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function encryptionConfigured(): boolean {
  return Boolean(process.env.SETTINGS_ENCRYPTION_KEY);
}
