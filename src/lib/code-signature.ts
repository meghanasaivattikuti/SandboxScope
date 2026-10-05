import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// A reviewed program stays runnable long enough to read it, not indefinitely.
const SIGNATURE_TTL_MS = 30 * 60 * 1000;

export class SignatureError extends Error {}

function signingSecret(): string {
  const secret = process.env.CODE_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CODE_SIGNING_SECRET is missing or shorter than 32 characters. Generated programs cannot be signed.",
    );
  }
  return secret;
}

function digest(code: string, expiresAt: number): Buffer {
  return createHmac("sha256", signingSecret()).update(`${expiresAt}.${code}`).digest();
}

export function signGeneratedCode(code: string): string {
  const expiresAt = Date.now() + SIGNATURE_TTL_MS;
  return `${expiresAt}.${digest(code, expiresAt).toString("hex")}`;
}

// Proves the code came from this server's generator and has not been edited in
// the browser. The execute route is the only caller, and it calls this before
// it spends anything on a Sandbox.
export function verifyGeneratedCode(code: string, signature: string): void {
  const separator = signature.indexOf(".");
  if (separator < 1) {
    throw new SignatureError("This program is missing a valid approval from the generator.");
  }

  const expiresAt = Number(signature.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt)) {
    throw new SignatureError("This program is missing a valid approval from the generator.");
  }

  const provided = Buffer.from(signature.slice(separator + 1), "hex");
  const expected = digest(code, expiresAt);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new SignatureError(
      "This program was not produced by the generator, or it was changed after review. Generate it again.",
    );
  }

  // Checked after the digest so the deadline itself is authenticated.
  if (Date.now() > expiresAt) {
    throw new SignatureError("This program's approval expired. Generate it again before running.");
  }
}
