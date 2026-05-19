# Todo App

Full-stack todo app — React + Vite frontend (port `5173`), Express + TypeScript backend (port `8080`), Postgres database. Containerized for AWS Fargate.

## Stack

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 18, Vite, TypeScript, react-router-dom                |
| Backend  | Express, TypeScript, pg, bcrypt, jsonwebtoken               |
| Database | Postgres (any managed instance — RDS, Neon, Supabase, etc.) |
| Runtime  | Node 20 (alpine) + nginx (alpine) for the SPA               |

## Project layout

```
todo-app/
├── backend/        # Express API
│   ├── src/
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
└── frontend/       # React + Vite SPA
    ├── src/
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    └── package.json
```

## API

All `/todos/*` routes require `Authorization: Bearer <jwt>`.

| Method | Path             | Body                       | Notes                  |
| ------ | ---------------- | -------------------------- | ---------------------- |
| POST   | `/auth/signup`   | `{ email, password }`      | Returns `{token,user}` |
| POST   | `/auth/signin`   | `{ email, password }`      | Returns `{token,user}` |
| GET    | `/todos`         | —                          | List current user's todos |
| POST   | `/todos`         | `{ title }`                | Create a todo          |
| DELETE | `/todos/:id`     | —                          | Delete a todo (must own) |
| GET    | `/health`        | —                          | Liveness check         |

The backend creates its `users` and `todos` tables on boot via `initSchema()` — point `DATABASE_URL` at any reachable Postgres and the schema is ready.

## Local development (without Docker)

1. Backend:
   ```bash
   cd backend
   cp .env.example .env       # fill in DATABASE_URL + JWT_SECRET
   npm install
   npm run dev
   ```
2. Frontend (in another shell):
   ```bash
   cd frontend
   cp .env.example .env       # VITE_API_URL defaults to http://localhost:8080
   npm install
   npm run dev
   ```

Frontend at `http://localhost:5173`, backend at `http://localhost:8080`.

## Docker — local

Build the images (multi-arch host, e.g. Apple Silicon dev machine):

```bash
docker build -t todo-backend  ./backend
docker build -t todo-frontend \
  --build-arg VITE_API_URL=http://localhost:8080 \
  ./frontend
```

Run them (point `DATABASE_URL` at any reachable Postgres):

```bash
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgres://user:pass@host:5432/todos' \
  -e JWT_SECRET='change-me' \
  -e CORS_ORIGIN='http://localhost:5173' \
  todo-backend

docker run --rm -p 5173:5173 todo-frontend
```

## AWS Fargate deployment

Both Dockerfiles produce `linux/amd64` images suitable for ECS/Fargate. On Apple Silicon, build with buildx:

```bash
docker buildx build --platform linux/amd64 -t <ecr-repo>/todo-backend:latest ./backend --push

docker buildx build --platform linux/amd64 \
  --build-arg VITE_API_URL=https://api.your-domain.com \
  -t <ecr-repo>/todo-frontend:latest ./frontend --push
```

### Backend Fargate task

- **Image**: `<ecr-repo>/todo-backend:latest`
- **Port mapping**: `8080/tcp`
- **Environment variables** (use AWS Secrets Manager for the sensitive ones):
  - `DATABASE_URL` — from Secrets Manager (RDS connection string)
  - `JWT_SECRET` — from Secrets Manager (long random string)
  - `PGSSL=true` — required for RDS
  - `CORS_ORIGIN=https://app.your-domain.com`
- **ALB target group**: HTTP, port 8080, health-check path `/health`
- **Logging**: `awslogs` driver to CloudWatch
- The container runs as a non-root user and exposes a built-in `HEALTHCHECK`.

### Frontend Fargate task

- **Image**: `<ecr-repo>/todo-frontend:latest`
- **Port mapping**: `5173/tcp`
- **Environment variables**: none at runtime — `VITE_API_URL` is baked in at build time.
- **ALB target group**: HTTP, port 5173, health-check path `/health`
- Serves the built SPA via nginx with a `try_files` fallback to `/index.html` so React Router works on refresh.

### Secrets

Never bake secrets into images or commit `.env` files. The `.env.example` files document required keys; in Fargate, inject the real values via task-definition `secrets` referencing Secrets Manager or SSM Parameter Store.

## Why these choices

- **JWT in `localStorage`** is fine for a small app behind HTTPS. For tighter security swap to httpOnly cookies + CSRF on the backend.
- **bcrypt rounds 10** balances signup latency vs. brute-force resistance.
- **nginx for the SPA** is the lightest possible production runtime (~25 MB image) and works cleanly behind an ALB.
- **`initSchema()` on boot** keeps the project bootable against any empty Postgres without a migration tool — easy to swap for `node-pg-migrate` / Prisma later.
