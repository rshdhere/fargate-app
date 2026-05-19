import { Router, Response } from 'express';
import { pool } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, created_at FROM todos WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId],
    );
    res.json(result.rows);
  } catch (e) {
    console.error('list todos error', e);
    res.status(500).json({ error: 'failed to list todos' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title required' });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: 'title too long' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO todos (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at',
      [req.userId, title.trim()],
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('create todo error', e);
    res.status(500).json({ error: 'failed to create todo' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'todo not found' });
    res.status(204).send();
  } catch (e) {
    console.error('delete todo error', e);
    res.status(500).json({ error: 'failed to delete todo' });
  }
});

export default router;
