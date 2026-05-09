# Design Rationale

## Product Shape

The MVP is a working dashboard rather than a landing page. The first screen shows search, area overview, normalized signal charts, and source-aware cards.

## Information Design

- The summary panel gives area code, retrieval date, confidence, and mock status.
- Indicator cards keep score, value, notes, and attribution together.
- Neighbor comparison is separated from the main score so it does not imply a hard ranking.
- Markdown report preview is visible because report generation is a core OSS use case.
- The main content is separated into tabs: overview, indicators, comparison, and report. This keeps the first screen focused while still making detailed evidence easy to reach.

## Wording

The UI avoids deterministic wording. It uses "公開データ上のシグナル" and "補助スコア" because the app is intended to help review evidence, not judge a place.

## Privacy

Search input is held only in React component state. The MVP does not use persistence APIs, analytics tags, or tracking scripts.

## Visual Style

The interface is quiet and operational: dense enough for repeated review, restrained in color, and chart-forward. Cards are used for repeated indicators, not for decorative page sections.
