import { SCORE_BAND_LABELS, scoreBand, type ScoreBand } from "@local-signal-japan/core";

const LEVELS: Record<ScoreBand, number> = { upper: 3, middle: 2, lower: 1, missing: 0 };

/**
 * 補助スコアと、全国を3等分した区分(上位・中位・下位)。
 * 区分は色ではなく、棒の本数と文字で示す。良し悪しを示す色(緑・赤)は使わない。
 */
export function ScorePill({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  const band = scoreBand(score);

  return (
    <span className={`score-pill score-pill--${size}`} data-band={band}>
      <span className="score-pill__level" aria-hidden="true">
        {[1, 2, 3].map((level) => (
          <i key={level} className={level <= LEVELS[band] ? "is-on" : undefined} />
        ))}
      </span>
      {score === null ? (
        <span className="score-pill__value">欠損</span>
      ) : (
        <>
          <span className="score-pill__value">{score}</span>
          <span className="score-pill__band">{SCORE_BAND_LABELS[band]}</span>
        </>
      )}
    </span>
  );
}
