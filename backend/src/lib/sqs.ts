import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EmailVerificationJob } from '../types/emailVerification';

let sqsClient: SQSClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: requireEnv('AWS_REGION'),
    });
  }

  return sqsClient;
}

export function getVerificationQueueUrl(): string {
  return requireEnv('AWS_SQS_QUEUE_URL');
}

export async function enqueueEmailVerification(job: EmailVerificationJob): Promise<void> {
  await getSqsClient().send(
    new SendMessageCommand({
      QueueUrl: getVerificationQueueUrl(),
      MessageBody: JSON.stringify(job),
    }),
  );
}
