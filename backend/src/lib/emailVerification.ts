import crypto from 'crypto';

const VERIFICATION_TOKEN_TTL_HOURS = 24;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function createEmailVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashEmailVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getEmailVerificationExpiry(): Date {
  return new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

export function buildEmailVerificationUrl(token: string): string {
  const baseUrl = requireEnv('EMAIL_VERIFICATION_URL');
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
