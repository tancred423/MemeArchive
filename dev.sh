#!/usr/bin/env bash
set -euo pipefail

DC="docker compose -f docker-compose.dev.yml"
cmd="${1:-}"

case "$cmd" in
  up)
    $DC up --build -d
    ;;
  down)
    $DC down
    ;;
  logs)
    $DC logs -f frontend backend
    ;;
  purge)
    $DC down -v
    ;;
  restart)
    $DC down
    $DC up --build -d
    ;;
  rebuild)
    $DC up --build -d --force-recreate
    ;;
  check)
    echo "=== Frontend: install (match CI) ==="
    $DC exec frontend npm ci

    echo "=== Frontend: Prettier (check) ==="
    $DC exec frontend npm run format:check

    echo "=== Frontend: ESLint ==="
    $DC exec frontend npm run lint

    echo "=== Frontend: TypeScript ==="
    $DC exec frontend npm run typecheck

    echo "=== Backend: Format (check) ==="
    $DC exec backend deno fmt --check src/

    echo "=== Backend: Lint ==="
    $DC exec backend deno lint src/

    echo "=== Backend: Type check ==="
    $DC exec backend deno check src/main.ts

    echo "All checks passed."
    ;;
  fix)
    echo "=== Frontend: install (match CI) ==="
    $DC exec frontend npm ci

    echo "=== Frontend: Prettier (write) ==="
    $DC exec frontend npm run format

    echo "=== Frontend: ESLint (fix) ==="
    $DC exec frontend npm run lint:fix

    echo "=== Frontend: TypeScript ==="
    $DC exec frontend npm run typecheck

    echo "=== Backend: Format (write) ==="
    $DC exec backend deno fmt src/

    echo "=== Backend: Lint ==="
    $DC exec backend deno lint src/

    echo "=== Backend: Type check ==="
    $DC exec backend deno check src/main.ts

    echo "All checks passed."
    ;;
  *)
    echo "Usage: ./dev.sh {up|down|logs|purge|restart|rebuild|check|fix}"
    exit 1
    ;;
esac
