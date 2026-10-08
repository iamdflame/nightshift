# Deploying Nightshift (runs 24/7 through judging)

Any small Linux VPS works (1 vCPU / 2 GB, ~€4–6/month, e.g. Hetzner CX22). Steps:

1. `git clone <repo> nightshift && cd nightshift`
2. Copy your local `.env` and `keys/` folder to the server (they unlock the agent wallets — keep them private), and `deployments/56.json` once contracts are deployed.
3. Seed history once: `docker compose run --rm collector pnpm exec tsx packages/tape/src/backfill.ts`
   (or copy your local `data/tape.sqlite` to keep the live record collected so far — recommended).
4. `docker compose up -d --build` — starts the collector, the Night Shift runner and the API on :8787.
5. HTTPS: put Caddy in front (`caddy reverse-proxy --from your.domain --to localhost:8787`) and set
   `NIGHTSHIFT_PUBLIC_URL=https://your.domain` in `.env` (used in agent cards and job deliverables).
6. Enable on-chain publishing once wallets are funded and contracts deployed: `NIGHTSHIFT_CHAIN=1` in `.env`, then `docker compose up -d`.

Health: `curl https://your.domain/v1/status` shows the session, next open, latest round and tape lag.
