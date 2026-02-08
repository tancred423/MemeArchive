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

## Code quality

With the dev stack up (`./dev.sh up`):

- `./dev.sh check` — run Prettier (check), ESLint, TypeScript, Deno fmt/lint/check (no writes).
- `./dev.sh fix` — same but applies Prettier and ESLint fixes and Deno fmt.

**If formatted files revert:** some editors reformat when they detect file changes. Close any open tabs for files that get formatted (e.g. `App.vue`) before running `./dev.sh fix`, then commit without reopening them, or turn off “Format on Save” for this project.

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
