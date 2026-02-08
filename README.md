# Meme Archive

Full-stack app: **Deno + TypeScript** backend, **Vue 3 + TypeScript** frontend. Memes and auth tokens are stored in MySQL.

## Dev (hot reload)

Copy `.env.skel` to `.env` and set `PASSWORD`. Then:

```bash
./dev.sh up
./dev.sh logs   # follow frontend + backend logs
./dev.sh down
./dev.sh purge  # down + remove volumes (db data)
```

- Frontend: http://localhost:5173 (Vite HMR)
- Backend: http://localhost:8000
- phpMyAdmin: http://localhost:8080 (dev only)

Dev stack includes a local **MySQL 8** container and **phpMyAdmin**. Backend waits for DB to be healthy before starting. Code changes in `backend/` and `frontend/` are picked up without rebuilding.

## Prod

Backend expects a **central MySQL server** on the `mysql-network` Docker network. Create that network if needed:

```bash
docker network create mysql-network
```

Set in `.env`: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (and optionally `MYSQL_PORT`) so the backend can reach your MySQL server on `mysql-network`.

```bash
docker compose up --build
```

- Frontend: http://localhost:80 (nginx)
- Backend: http://localhost:8000

Frontend talks to the backend via `/api`, proxied by nginx in prod and by Vite in dev.
