import type { SeriesPoint } from "@local-signal-japan/core";

type SparklineProps = {
  points: SeriesPoint[];
  /** この年より後は調査方法が異なるため、線でつながない。 */
  breakAfterYear?: number;
  width?: number;
  height?: number;
};

const PAD = 3;

/**
 * 一覧の行に置く小さな折れ線。値は同じ行に文字で出ているので、形だけを見せる。
 * 横軸は実際の年の間隔に合わせる（5年ごとの調査と毎年の統計で詰まり方が変わる）。
 */
export function Sparkline({ points, breakAfterYear, width = 96, height = 28 }: SparklineProps) {
  if (points.length < 2) {
    return <span className="sparkline sparkline--empty" aria-hidden="true" />;
  }

  const years = points.map(([year]) => year);
  const values = points.map(([, value]) => value);
  const firstYear = years[0] as number;
  const lastYear = years.at(-1) as number;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (year: number) => PAD + ((year - firstYear) / (lastYear - firstYear)) * (width - PAD * 2);
  const y = (value: number) =>
    max === min ? height / 2 : PAD + (1 - (value - min) / (max - min)) * (height - PAD * 2);

  const segments =
    breakAfterYear === undefined
      ? [points]
      : [points.filter(([year]) => year <= breakAfterYear), points.filter(([year]) => year > breakAfterYear)];
  const last = points.at(-1) as SeriesPoint;
  const path = (segment: SeriesPoint[]) => segment.map(([year, value]) => `${x(year)},${y(value)}`).join(" ");

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {segments.map((segment) =>
        segment.length > 1 ? (
          <polyline className="sparkline__line" key={segment[0]?.[0]} points={path(segment)} />
        ) : null
      )}
      <circle className="sparkline__dot" cx={x(last[0])} cy={y(last[1])} r={2.25} />
    </svg>
  );
}
