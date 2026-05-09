# Data Sources

The MVP uses mock data only. The mock fixtures are intentionally marked as `isMock: true` and are not real statistics.

## Planned Public Sources

| Source | Planned Use | API Key Boundary | Notes |
| --- | --- | --- | --- |
| e-Stat | Population, age structure, migration | Server side only | Show survey name, retrieval date, and table metadata. |
| G Biz INFO | Corporate activity signals | Server side only | Avoid storing company profiles in MVP. |
| Real Estate Information Library | Land-price signals | Server side only | Separate commercial, residential, and industrial locations. |
| Public procurement sources | Procurement and award signals | Server side only | Show publication date and data processing notes. |
| Geospatial Information Authority of Japan tiles | Optional map context | Browser tile access only if needed | Do not add map UI until it improves interpretation. |

## Mock Data Rules

- Mock data must be visually labeled.
- Mock data must not be mixed with real public data in the same card without explicit labels.
- Mock source labels use `mock://` labels rather than real URLs.
- Mock dates are fixture dates, not evidence of actual retrieval from the named public source.
