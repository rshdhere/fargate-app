import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import todosRouter from './routes/todos';
import { initSchema } from './db';

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/todos', todosRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

async function start() {
  try {
    await initSchema();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API listening on 0.0.0.0:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start server', e);
    process.exit(1);
  }
}

start();
