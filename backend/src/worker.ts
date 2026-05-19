import 'dotenv/config';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { buildEmailVerificationUrl } from './lib/emailVerification';
import { getResendClient, getResendFromEmail } from './lib/resend';
import { getSqsClient, getVerificationQueueUrl } from './lib/sqs';
import { EmailVerificationJob } from './types/emailVerification';

const WAIT_TIME_SECONDS = 20;
const VISIBILITY_TIMEOUT_SECONDS = 30;
const MAX_NUMBER_OF_MESSAGES = 1;

let shuttingDown = false;

function isEmailVerificationJob(value: unknown): value is EmailVerificationJob {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const job = value as Partial<EmailVerificationJob>;
  return (
    job.type === 'send-email-verification' &&
    typeof job.userId === 'number' &&
    typeof job.email === 'string' &&
    typeof job.verificationToken === 'string'
  );
}

async function deleteMessage(message: Message): Promise<void> {
  if (!message.ReceiptHandle) {
    throw new Error('SQS message is missing ReceiptHandle');
  }

  await getSqsClient().send(
    new DeleteMessageCommand({
      QueueUrl: getVerificationQueueUrl(),
      ReceiptHandle: message.ReceiptHandle,
    }),
  );
}

async function sendVerificationEmail(job: EmailVerificationJob): Promise<void> {
  const verificationUrl = buildEmailVerificationUrl(job.verificationToken);
  const resend = getResendClient();

  await resend.emails.send({
    from: getResendFromEmail(),
    to: job.email,
    subject: 'Verify your email',
    html: `
      <p>Welcome.</p>
      <p>Verify your email address by opening the link below:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Verify your email address: ${verificationUrl}\n\nThis link expires in 24 hours.`,
  });
}

async function handleMessage(message: Message): Promise<void> {
  if (!message.Body) {
    console.error('Skipping SQS message with empty body');
    await deleteMessage(message);
    return;
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(message.Body);
  } catch (error) {
    console.error('Skipping invalid SQS message JSON', error);
    await deleteMessage(message);
    return;
  }

  if (!isEmailVerificationJob(parsedBody)) {
    console.error('Skipping SQS message with invalid verification payload');
    await deleteMessage(message);
    return;
  }

  await sendVerificationEmail(parsedBody);
  await deleteMessage(message);
  console.log(`Sent verification email to ${parsedBody.email}`);
}

async function pollOnce(): Promise<void> {
  const response = await getSqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl: getVerificationQueueUrl(),
      WaitTimeSeconds: WAIT_TIME_SECONDS,
      VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      MaxNumberOfMessages: MAX_NUMBER_OF_MESSAGES,
    }),
  );

  for (const message of response.Messages ?? []) {
    try {
      await handleMessage(message);
    } catch (error) {
      console.error('Failed to process verification email job', error);
    }
  }
}

async function startWorker(): Promise<void> {
  console.log('Verification email worker started');

  while (!shuttingDown) {
    await pollOnce();
  }

  console.log('Verification email worker stopped');
}

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}, shutting down verification email worker`);
  shuttingDown = true;
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startWorker().catch((error) => {
  console.error('Verification email worker crashed', error);
  process.exit(1);
});
