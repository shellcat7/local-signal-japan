import { SCORE_BAND_LABELS, scoreBand } from "@local-signal-japan/core";

/**
 * 補助スコアと、全国を3等分した区分(上位・中位・下位)。
 * 区分は文字で示す。良し悪しを連想させる色(緑・赤)は使わない。
 */
export function ScoreBadge({ score }: { score: number | null }) {
  const band = scoreBand(score);

  return (
    <span className="score-badge" data-band={band}>
      {score === null ? (
        <span className="score-badge__value">欠損</span>
      ) : (
        <>
          <span className="score-badge__value">{score}</span>
          <span className="score-badge__band">{SCORE_BAND_LABELS[band]}</span>
        </>
      )}
    </span>
  );
}
