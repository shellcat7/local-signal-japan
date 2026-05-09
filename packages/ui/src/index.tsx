import type { IndicatorValue, SourceAttribution } from "@local-signal-japan/schemas";
import { normalizeScore, scoreBand } from "@local-signal-japan/scoring";

export function ScorePill({ score }: { score: number | null | undefined }) {
  const normalized = normalizeScore(score);
  const band = scoreBand(normalized);

  return (
    <span className={`score-pill score-pill--${band}`}>
      {normalized === null ? "欠損" : `${normalized}`}
    </span>
  );
}

export function SourceList({ sources }: { sources: SourceAttribution[] }) {
  return (
    <ul className="source-list" aria-label="出典">
      {sources.map((source) => (
        <li key={`${source.sourceName}-${source.sourceUrlLabel}`}>
          <span>{source.sourceName}</span>
          <small>
            {source.sourceUrlLabel} / retrieved {source.retrievedAt} / {source.isMock ? "mock" : "public"}
          </small>
          <small>{source.licenseNote}</small>
        </li>
      ))}
    </ul>
  );
}

export function IndicatorCard({ indicator }: { indicator: IndicatorValue }) {
  return (
    <article className="indicator-card">
      <div className="indicator-card__head">
        <div>
          <h3>{indicator.label}</h3>
          <p>{indicator.value ?? "欠損"}{indicator.unit ? ` ${indicator.unit}` : ""}</p>
        </div>
        <ScorePill score={indicator.score} />
      </div>
      <ul className="note-list">
        {indicator.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <SourceList sources={indicator.sources} />
    </article>
  );
}
