# Security

## Secret Handling

- Real API keys and tokens must never be committed.
- `.env.example` is the only environment template committed to the repository.
- Local secret files are ignored by `.gitignore`.
- Cloudflare secrets must be configured through the platform, not written into source or config files.
- Frontend environment variables must not contain secrets.

## Server-Side Boundary

External API access belongs in Cloudflare Workers or Pages Functions. Browser bundles should receive normalized signal objects rather than upstream raw responses.

## Logging

Do not log municipality search terms, environment values, upstream response bodies, or request metadata unless a future design explicitly documents a safe opt-in path.

## Automated Scan

Run:

```bash
pnpm scan:secrets
```

The scanner checks for local secret files and common credential-like patterns before public release.
