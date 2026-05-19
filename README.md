# Todo App

Full-stack todo app — React + Vite frontend (port `5173`), Express + TypeScript backend (port `8080`), Postgres database. Containerized for AWS Fargate.

## Stack

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 18, Vite, TypeScript, react-router-dom                |
| Backend  | Express, TypeScript, pg, bcrypt, jsonwebtoken, AWS SQS, Resend |
| Database | Postgres (any managed instance — RDS, Neon, Supabase, etc.) |
| Runtime  | Node 20 (alpine) + nginx (alpine) for the SPA               |

## Project layout

```
todo-app/
├── backend/        # Express API
│   ├── src/
│   ├── Dockerfile
│   ├── Dockerfile.worker
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

| Method | Path                         | Body                  | Notes |
| ------ | ---------------------------- | --------------------- | ----- |
| POST   | `/auth/signup`               | `{ email, password }` | Creates an unverified user and queues a verification email |
| POST   | `/auth/signin`               | `{ email, password }` | Returns `{token,user}` only after the email is verified |
| POST   | `/auth/resend-verification`  | `{ email }`           | Re-queues a verification email for an unverified account |
| GET    | `/auth/verify-email?token=`  | —                     | Marks the email as verified |
| GET    | `/todos`                     | —                     | List current user's todos |
| POST   | `/todos`                     | `{ title }`           | Create a todo |
| DELETE | `/todos/:id`                 | —                     | Delete a todo (must own) |
| GET    | `/health`                    | —                     | Liveness check |

The backend creates its `users` and `todos` tables on boot via `initSchema()` — point `DATABASE_URL` at any reachable Postgres and the schema is ready.

## Local development (without Docker)

1. Backend:
   ```bash
   cd backend
   cp .env.example .env       # fill in DATABASE_URL + JWT_SECRET + SQS/Resend vars
   npm install
   npm run dev
   ```
   Start the verification worker in another shell:
   ```bash
   cd backend
   npm run worker:dev
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
  -e EMAIL_VERIFICATION_URL='http://localhost:8080/auth/verify-email' \
  -e AWS_REGION='us-east-1' \
  -e AWS_SQS_QUEUE_URL='https://sqs.us-east-1.amazonaws.com/123456789012/todo-email-verification' \
  todo-backend

docker build -t todo-backend-worker -f ./backend/Dockerfile.worker ./backend

docker run --rm \
  -e AWS_REGION='us-east-1' \
  -e AWS_SQS_QUEUE_URL='https://sqs.us-east-1.amazonaws.com/123456789012/todo-email-verification' \
  -e EMAIL_VERIFICATION_URL='http://localhost:8080/auth/verify-email' \
  -e RESEND_API_KEY='re_xxxxxxxxx' \
  -e RESEND_FROM_EMAIL='Todo App <onboarding@your-domain.com>' \
  todo-backend-worker

docker run --rm -p 5173:5173 todo-frontend
```

## AWS Fargate deployment

Both Dockerfiles produce `linux/amd64` images suitable for ECS/Fargate. On Apple Silicon, build with buildx:

```bash
docker buildx build --platform linux/amd64 -t <ecr-repo>/todo-backend:latest ./backend --push

docker buildx build --platform linux/amd64 -t <ecr-repo>/todo-backend-worker:latest -f ./backend/Dockerfile.worker ./backend --push

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
  - `EMAIL_VERIFICATION_URL=https://api.your-domain.com/auth/verify-email`
  - `AWS_REGION=us-east-1`
  - `AWS_SQS_QUEUE_URL` — SQS queue URL for verification-email jobs
- **ALB target group**: HTTP, port 8080, health-check path `/health`
- **Logging**: `awslogs` driver to CloudWatch
- **IAM permissions**:
  - `sqs:SendMessage`
- The container runs as a non-root user and exposes a built-in `HEALTHCHECK`.

### Worker Fargate task

- **Image**: `<ecr-repo>/todo-backend-worker:latest`
- **Port mapping**: none
- **Environment variables**:
  - `AWS_REGION=us-east-1`
  - `AWS_SQS_QUEUE_URL` — from Secrets Manager or plain env
  - `EMAIL_VERIFICATION_URL=https://api.your-domain.com/auth/verify-email`
  - `RESEND_API_KEY` — from Secrets Manager
  - `RESEND_FROM_EMAIL=Todo App <onboarding@your-domain.com>`
- **IAM permissions**:
  - `sqs:ReceiveMessage`
  - `sqs:DeleteMessage`
  - `sqs:GetQueueAttributes`
  - `sqs:ChangeMessageVisibility`
- **Logging**: `awslogs` driver to CloudWatch

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
