# Debian (glibc) rather than Alpine (musl) so better-sqlite3 resolves its prebuilt
# binaries. Both stages share the base image so the compiled native module copied
# forward from the builder is ABI-compatible with the runtime's Node.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Only used if better-sqlite3 has no prebuild for the target architecture and
# falls back to compiling from source.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
	DATABASE_PATH=/app/data/cashflow.db

# node_modules is copied whole, dev dependencies included. Two reasons: drizzle-kit
# is a devDependency and the entrypoint runs it to create the schema, and copying
# the tree forward carries the already-compiled better-sqlite3 binary without
# needing a build toolchain in this stage.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --chown=node:node package.json drizzle.config.ts ./
# Read by `drizzle-kit push` at startup.
COPY --chown=node:node src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
	&& mkdir -p /app/data \
	&& chown node:node /app/data

USER node

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
