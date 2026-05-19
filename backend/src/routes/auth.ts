import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '7d';

function signToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ userId }, secret, { expiresIn: TOKEN_TTL });
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
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), hash],
    );
    const user = result.rows[0];
    const token = signToken(user.id);
    res.status(201).json({ token, user });
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
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('signin error', e);
    res.status(500).json({ error: 'signin failed' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json(user);
  } catch (e) {
    console.error('get current user error', e);
    res.status(500).json({ error: 'failed to load user' });
  }
});

export default router;
