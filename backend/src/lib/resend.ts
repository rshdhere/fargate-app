import { Resend } from 'resend';

let resendClient: Resend | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(requireEnv('RESEND_API_KEY'));
  }

  return resendClient;
}

export function getResendFromEmail(): string {
  return requireEnv('RESEND_FROM_EMAIL');
}
