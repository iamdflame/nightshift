# Nightshift runtime image: collector, Night Shift runner and API share this image.
FROM node:24-slim
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
# The website (apps/web) is built into apps/web/dist and served by the API at "/".
RUN pnpm --filter @nightshift/web build
ENV NODE_ENV=production NIGHTSHIFT_DB=/app/data/tape.sqlite NIGHTSHIFT_WEB_DIST=/app/apps/web/dist
# One supervised container (collector, runner, API on $PORT); docker-compose overrides the command per service.
CMD ["node", "--import", "tsx", "deploy/railway/start.ts"]
