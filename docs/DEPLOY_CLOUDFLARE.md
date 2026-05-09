# Deploy to Cloudflare

This project is prepared for Cloudflare Pages plus an optional Hono Worker API.

## Web App on Cloudflare Pages

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Build the Vite app.

   ```bash
   pnpm build
   ```

3. In Cloudflare Pages, use:

   - Build command: `pnpm build`
   - Build output directory: `apps/web/dist`
   - Root directory: repository root

4. Open the Preview Deployment and check `/demo`.

## Worker API

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Run locally.

   ```bash
   pnpm --filter @local-signal-japan/worker dev
   ```

3. Deploy when ready.

   ```bash
   pnpm --filter @local-signal-japan/worker deploy
   ```

## Secrets

When real connectors are added, configure provider credentials as Cloudflare secrets. Do not place secret values in `wrangler.jsonc`, source files, tests, fixtures, screenshots, or docs.

## D1

D1 is intentionally not used for search history in the MVP. If D1 is introduced later, it should store only explicitly documented non-personal application data.

## GitHub Secrets

For GitHub Actions deployment, store deployment credentials in GitHub repository secrets and reference them from workflow configuration. Do not commit deployment credentials.
