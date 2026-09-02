#!/usr/bin/env bash
#
# Spin up the whole dashboard locally with one command.
#
#   ./start.sh                # build, start app + ollama, pull the model, wait, print the URL
#   ./start.sh --import-db    # additionally seed an empty volume from ./data/cashflow.db
#
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="cash-flow-dashboard"
DATA_VOLUME="${PROJECT}_cashflow-data"
APP_IMAGE="cash-flow-dashboard:latest"
APP_URL="http://localhost:3000"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1}"

IMPORT_DB=false
for arg in "$@"; do
	case "$arg" in
		--import-db) IMPORT_DB=true ;;
		-h|--help)
			sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "Unknown option: $arg (try --help)" >&2
			exit 1
			;;
	esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    %s\033[0m\n' "$1"; }

# --- 1. Preflight ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
	echo "Docker isn't installed. Install Docker Desktop: https://docs.docker.com/get-docker/" >&2
	exit 1
fi

if ! docker info >/dev/null 2>&1; then
	echo "Can't reach the Docker daemon. Start Docker Desktop and try again." >&2
	exit 1
fi

# --- 2. Build ----------------------------------------------------------------
say "Building the app image (first run compiles better-sqlite3; give it a few minutes)"
docker compose build

# --- 3. Optional one-time import of an existing local database ---------------
if [ "$IMPORT_DB" = true ]; then
	say "Checking whether the data volume needs seeding"

	# Let Compose create the volume so it carries Compose's own labels. Creating it
	# implicitly via `docker run` below would work, but Compose then warns on every
	# `up` that the volume "was not created by Docker Compose".
	docker compose create app >/dev/null 2>&1 || true

	# Reports whether a database is already in the volume.
	# Two details matter here:
	#   --entrypoint  — the image's own entrypoint would start the server instead.
	#   mount at /app/data — that path exists in the image owned by node:node, so a
	#   fresh volume inherits that ownership. Mounting at a path the image lacks
	#   would create a root-owned volume the app (running as node) can't write to.
	if docker run --rm --entrypoint test -v "${DATA_VOLUME}:/app/data" "$APP_IMAGE" \
		-f /app/data/cashflow.db 2>/dev/null; then
		warn "Volume already contains cashflow.db — leaving it untouched."
	elif [ ! -f ./data/cashflow.db ]; then
		warn "No ./data/cashflow.db to import — starting with a fresh database."
	else
		warn "Importing ./data/cashflow.db into the volume."
		warn "Stop any local 'npm run dev' first so the file isn't mid-write."
		# The -wal/-shm siblings carry recent writes; copying the .db alone would
		# silently lose them. cp -n never overwrites.
		docker run --rm --entrypoint sh \
			-v "${DATA_VOLUME}:/app/data" \
			-v "$PWD/data:/src:ro" \
			"$APP_IMAGE" \
			-c 'cp -n /src/cashflow.db /app/data/ && for f in /src/cashflow.db-wal /src/cashflow.db-shm; do [ -f "$f" ] && cp -n "$f" /app/data/; done; true'
		echo "    Imported."
	fi
fi

# --- 4. Start ----------------------------------------------------------------
say "Starting containers"
docker compose up -d

# --- 5. Make sure the model is present ---------------------------------------
say "Waiting for Ollama"
for _ in $(seq 1 60); do
	if docker compose exec -T ollama ollama list >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

if docker compose exec -T ollama ollama list 2>/dev/null | grep -q "^${OLLAMA_MODEL}"; then
	echo "    Model '${OLLAMA_MODEL}' is already present."
else
	say "Pulling model '${OLLAMA_MODEL}' — this is a multi-GB download on first run"
	docker compose exec -T ollama ollama pull "$OLLAMA_MODEL"
fi

# --- 6. Wait for the app -----------------------------------------------------
say "Waiting for the app to become healthy"
for _ in $(seq 1 60); do
	status="$(docker inspect --format '{{.State.Health.Status}}' \
		"$(docker compose ps -q app)" 2>/dev/null || echo starting)"
	if [ "$status" = "healthy" ]; then
		printf '\n\033[32m    Ready — %s\033[0m\n\n' "$APP_URL"
		echo "    Logs:  docker compose logs -f app"
		echo "    Stop:  docker compose down"
		exit 0
	fi
	if [ "$status" = "unhealthy" ]; then
		break
	fi
	sleep 2
done

echo
echo "The app didn't report healthy in time. Recent logs:" >&2
docker compose logs --tail 40 app >&2
exit 1
