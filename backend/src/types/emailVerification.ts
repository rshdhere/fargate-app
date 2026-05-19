export interface EmailVerificationJob {
  type: 'send-email-verification';
  userId: number;
  email: string;
  verificationToken: string;
}
