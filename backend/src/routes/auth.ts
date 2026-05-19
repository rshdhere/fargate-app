import { Router } from 'express';
import bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import {
  createEmailVerificationToken,
  getEmailVerificationExpiry,
  hashEmailVerificationToken,
} from '../lib/emailVerification';
import { enqueueEmailVerification } from '../lib/sqs';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { EmailVerificationJob } from '../types/emailVerification';

const router = Router();
const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '7d';

interface UserRow {
  id: number;
  email: string;
  email_verified: boolean;
}

function signToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ userId }, secret, { expiresIn: TOKEN_TTL });
}

async function createVerificationToken(client: PoolClient, userId: number): Promise<string> {
  const verificationToken = createEmailVerificationToken();
  const tokenHash = hashEmailVerificationToken(verificationToken);
  const expiresAt = getEmailVerificationExpiry();

  await client.query(
    `
      DELETE FROM email_verification_tokens
      WHERE user_id = $1 AND consumed_at IS NULL
    `,
    [userId],
  );

  await client.query(
    `
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  return verificationToken;
}

function buildVerificationJob(user: UserRow, verificationToken: string): EmailVerificationJob {
  return {
    type: 'send-email-verification',
    userId: user.id,
    email: user.email,
    verificationToken,
  };
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const client = await pool.connect();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user: UserRow;
    let verificationToken: string;

    try {
      await client.query('BEGIN');
      const result = await client.query<UserRow>(
        `
          INSERT INTO users (email, password_hash)
          VALUES ($1, $2)
          RETURNING id, email, email_verified
        `,
        [normalizedEmail, hash],
      );
      user = result.rows[0];
      verificationToken = await createVerificationToken(client, user.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    try {
      await enqueueEmailVerification(buildVerificationJob(user, verificationToken));
    } catch (error) {
      await pool.query('DELETE FROM users WHERE id = $1 AND email_verified = FALSE', [user.id]);
      console.error('enqueue verification email error', error);
      return res.status(500).json({ error: 'failed to queue verification email' });
    }

    res.status(201).json({
      message: 'signup successful, verify your email before signing in',
      user,
    });
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505') {
      return res.status(409).json({ error: 'email already registered' });
    }
    console.error('signup error', e);
    res.status(500).json({ error: 'signup failed' });
  }
});

router.post('/signin', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    if (!user.email_verified) {
      return res.status(403).json({ error: 'email not verified' });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    });
  } catch (e) {
    console.error('signin error', e);
    res.status(500).json({ error: 'signin failed' });
  }
});

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const client = await pool.connect();
    let user: UserRow | null = null;
    let verificationToken: string | null = null;

    try {
      await client.query('BEGIN');
      const result = await client.query<UserRow>(
        `
          SELECT id, email, email_verified
          FROM users
          WHERE email = $1
          FOR UPDATE
        `,
        [normalizedEmail],
      );

      user = result.rows[0] ?? null;

      if (user && !user.email_verified) {
        verificationToken = await createVerificationToken(client, user.id);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (user && verificationToken) {
      await enqueueEmailVerification(buildVerificationJob(user, verificationToken));
    }

    res.json({ message: 'if the account exists and is unverified, a new verification email has been sent' });
  } catch (e) {
    console.error('resend verification error', e);
    res.status(500).json({ error: 'failed to resend verification email' });
  }
});

router.get('/verify-email', async (req, res) => {
  const token = req.query.token;
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ error: 'verification token required' });
  }

  const tokenHash = hashEmailVerificationToken(token);

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<{
        verification_id: number;
        user_id: number;
        expires_at: Date;
        consumed_at: Date | null;
        email_verified: boolean;
      }>(
        `
          SELECT
            evt.id AS verification_id,
            evt.user_id,
            evt.expires_at,
            evt.consumed_at,
            u.email_verified
          FROM email_verification_tokens evt
          INNER JOIN users u ON u.id = evt.user_id
          WHERE evt.token_hash = $1
          FOR UPDATE
        `,
        [tokenHash],
      );

      const verification = result.rows[0];
      if (!verification) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'invalid verification token' });
      }

      if (verification.email_verified) {
        await client.query('ROLLBACK');
        return res.json({ message: 'email already verified' });
      }

      if (verification.consumed_at) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'verification token already used' });
      }

      if (new Date(verification.expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'verification token expired' });
      }

      await client.query(
        `
          UPDATE email_verification_tokens
          SET consumed_at = NOW()
          WHERE id = $1
        `,
        [verification.verification_id],
      );

      await client.query(
        `
          UPDATE users
          SET email_verified = TRUE, email_verified_at = NOW()
          WHERE id = $1
        `,
        [verification.user_id],
      );

      await client.query(
        `
          DELETE FROM email_verification_tokens
          WHERE user_id = $1 AND id <> $2
        `,
        [verification.user_id, verification.verification_id],
      );

      await client.query('COMMIT');
      res.json({ message: 'email verified successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('verify email error', e);
    res.status(500).json({ error: 'failed to verify email' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, email_verified AS "emailVerified" FROM users WHERE id = $1',
      [req.userId],
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json(user);
  } catch (e) {
    console.error('get current user error', e);
    res.status(500).json({ error: 'failed to load user' });
  }
});

export default router;
