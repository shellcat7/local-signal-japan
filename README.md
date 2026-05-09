# Local Signal Japan

Local Signal Japan is a standalone TypeScript/React project that visualizes local public-data signals for Japanese municipalities. The MVP runs with mock data only, so it can be tested without API keys.

The app avoids deterministic labels such as "this region is growing" or "this region is declining". It presents normalized indicators as public-data signals with sources, retrieval dates, processing notes, and missing-data notes.

## Current MVP

- React/Vite dashboard at `/demo`
- Hono Worker API scaffold
- Mock municipality signal data
- Indicator cards for population, aging rate, migration, land price, corporate activity, procurement activity, and employment
- Neighbor comparison view
- Markdown report generation
- CLI report scaffold
- Secret scanning script
- Cloudflare deployment notes

## Local Setup

0. Confirm Node.js, npm, and Corepack are available.

   ```bash
   node -v
   npm -v
   corepack -v
   ```

   If `corepack` or `npm` is not recognized on Windows, install the normal Node.js LTS package from `https://nodejs.org/`, then close and reopen Command Prompt.

1. Enable pnpm through Corepack.

   ```bash
   corepack enable
   corepack prepare pnpm@9.12.3 --activate
   ```

2. Install dependencies.

   ```bash
   pnpm install
   ```

3. Run the web app.

   ```bash
   pnpm dev
   ```

4. Open the demo route.

   ```text
   http://127.0.0.1:5173/demo
   ```

## Windows Troubleshooting

If Command Prompt says `'corepack' is not recognized`, use this order:

1. Install Node.js LTS from the official Node.js website.
2. Close all Command Prompt and PowerShell windows.
3. Open a new Command Prompt.
4. Run `node -v`, `npm -v`, and `corepack -v`.
5. Return to this project directory and run the setup commands again.

If `npm -v` works but `corepack -v` still fails, install pnpm directly:

```bash
npm install -g pnpm@9.12.3
pnpm -v
```

If `corepack enable` fails on Windows with an `EPERM` error under `C:\Program Files\nodejs`, it is usually a permissions issue while creating package-manager shims. You can continue in either of these ways:

```bash
corepack pnpm install
corepack pnpm preflight
corepack pnpm dev
```

Or install pnpm into the user-level npm global folder:

```bash
npm install -g pnpm@9.12.3
pnpm install
pnpm preflight
pnpm dev
```

## CLI

```bash
pnpm localsignal demo
pnpm localsignal report --area-code 13101 --out reports/local-signal-demo.md
```

The bundled CLI fixture supports area code `13101` only in the MVP. Additional connectors will be added behind server-side boundaries.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm scan:secrets
pnpm preflight
```

## Public Release Checklist

- Confirm `.env`, `.dev.vars`, and other local secret files are not tracked.
- Confirm `.env.example` contains placeholders only.
- Confirm frontend bundles contain no API keys, tokens, signed URLs, or upstream raw responses.
- Confirm all API-key access happens in Cloudflare Workers or Pages Functions.
- Confirm `/demo` uses only mock data.
- Confirm sources, retrieval dates, license notes, and processing state are visible in UI and reports.
- Confirm the wording avoids deterministic regional judgments.
- Run `pnpm preflight` before publishing.

## Documentation

- [Data sources](docs/DATA_SOURCES.md)
- [Database](docs/DATABASE.md)
- [Attribution](docs/ATTRIBUTION.md)
- [Methodology](docs/METHODOLOGY.md)
- [Design rationale](docs/DESIGN_RATIONALE.md)
- [Review checklist](docs/REVIEW_CHECKLIST.md)
- [Privacy](docs/PRIVACY.md)
- [Security](docs/SECURITY.md)
- [Cloudflare deployment](docs/DEPLOY_CLOUDFLARE.md)
- [Roadmap](docs/ROADMAP.md)

## License

MIT
