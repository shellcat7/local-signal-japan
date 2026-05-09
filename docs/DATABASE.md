# Database

The MVP does not store search history, municipality input, IP addresses, user agents, referers, or personal data.

D1 is reserved for public-data metadata that helps explain where a signal came from. The current schema stores source snapshots such as source name, source label, area code, retrieval date, license note, processing note, and mock/public flag.

## Tables

### `data_source_snapshots`

| Column | Purpose |
| --- | --- |
| `id` | Stable metadata snapshot id |
| `source_name` | Human-readable public data source name |
| `source_url_label` | Source URL or mock label |
| `area_code` | Municipality code when source metadata is area-specific |
| `retrieved_at` | Retrieval or fixture date |
| `published_at` | Published date when available |
| `license_note` | License or reuse note |
| `processing_note` | Processing or mock-data note |
| `is_mock` | `1` for mock data, `0` for public data |

## Local Policy

- Do not add a `search_history` table in the MVP.
- Do not store user-entered search terms.
- Do not store request metadata.
- Do not store company profiles copied from upstream APIs.

## Cloudflare D1 Setup

After logging in with Wrangler, create the database:

```bash
pnpm --filter @local-signal-japan/worker wrangler d1 create local-signal-japan-public-data
```

Copy the returned `database_id` into `apps/worker/wrangler.jsonc` or use `apps/worker/wrangler.d1.example.jsonc` as a template.

Apply migrations:

```bash
pnpm --filter @local-signal-japan/worker wrangler d1 migrations apply local-signal-japan-public-data
```

For local development, Wrangler uses local storage by default. Keep production and preview databases separate when connecting real public data.
