# Methodology

Local Signal Japan summarizes public-data signals. It does not determine whether a municipality is good, bad, growing, or declining.

## Score Normalization

- Indicator values are converted to auxiliary scores from 0 to 100.
- Missing data is not treated as a low score.
- Overall score is an average of available indicator scores only.
- Score bands are descriptive UI groupings, not rankings.

## MVP Indicators

- Population trend
- Aging rate
- Migration signal
- Land-price trend
- Corporate activity signal
- Procurement activity signal
- Employment-related signal

## Interpretation Guardrails

- Show notes for each indicator.
- Show missing-data notes.
- Avoid single-score conclusions.
- Show confidence level as a metadata note.
- Prefer "public-data signal" wording over deterministic regional judgments.

## Future Methodology Work

- Add source-specific confidence metadata.
- Separate city, ward, town, and village cases.
- Add outlier handling for small municipalities.
- Add multi-year smoothing for volatile indicators.
- Make the scoring formula configurable in the SDK package.
