import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatNumber, formatYear, type Cycle, type SeriesPoint } from "@local-signal-japan/core";
import { axisTickFormatter, niceAxis, pickStride } from "../lib/scale";
import { useElementWidth } from "../lib/useElementWidth";
import { ScrollRegion } from "./ScrollRegion";

type LineChartProps = {
  /** グラフの名前。読み上げと表の見出しに使う。 */
  title: string;
  points: SeriesPoint[];
  unit: string;
  decimals: number;
  cycle: Cycle;
  signed?: boolean;
  height?: number;
  /** この年より後は調査方法が異なるため、線でつながない。 */
  breakAfterYear?: number;
};

const MARGIN = { top: 22, right: 18, bottom: 26 };

/** 単一系列の折れ線グラフ。ポインターとキーボードの両方で各年の値を読める。 */
export function LineChart({
  title,
  points,
  unit,
  decimals,
  cycle,
  signed = false,
  height = 200,
  breakAfterYear
}: LineChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>(480);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const descriptionId = useId();

  if (points.length === 0) {
    return <p className="chart-empty">表示できる時系列がありません。</p>;
  }

  const axis = niceAxis(points.map(([, value]) => value));
  const tickLabels = axis.ticks.map(axisTickFormatter(axis));
  const marginLeft = Math.max(...tickLabels.map((label) => label.length)) * 7.5 + 14;
  const plotWidth = Math.max(width - marginLeft - MARGIN.right, 40);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const years = points.map(([year]) => year);
  const firstYear = years[0] as number;
  const lastYear = years.at(-1) as number;
  const x = (year: number) =>
    marginLeft + (lastYear === firstYear ? plotWidth / 2 : ((year - firstYear) / (lastYear - firstYear)) * plotWidth);
  const y = (value: number) => MARGIN.top + (1 - (value - axis.min) / (axis.max - axis.min)) * plotHeight;

  // 面の塗りは、正負をまたぐ系列では 0 の線から、それ以外では下端から伸ばす。
  const baseY = axis.min < 0 && axis.max > 0 ? y(0) : MARGIN.top + plotHeight;

  const formatValue = (value: number) => `${formatNumber(value, decimals, signed)}${unit}`;
  const segments =
    breakAfterYear === undefined
      ? [points]
      : [points.filter(([year]) => year <= breakAfterYear), points.filter(([year]) => year > breakAfterYear)];
  const xLabelYears = pickStride(years, Math.max(2, Math.floor(plotWidth / 64)));
  const showAllDots = points.length <= 8;
  const lastPoint = points.at(-1) as SeriesPoint;
  const active = activeIndex === null ? null : (points[activeIndex] ?? null);

  const handlePointer = (event: PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return;
    const pointerX = event.clientX - bounds.left;
    let nearest = 0;
    points.forEach(([year], index) => {
      if (Math.abs(x(year) - pointerX) < Math.abs(x((points[nearest] as SeriesPoint)[0]) - pointerX)) {
        nearest = index;
      }
    });
    setActiveIndex(nearest);
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = activeIndex ?? points.length - 1;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(points.length - 1, current + 1),
      Home: 0,
      End: points.length - 1
    };
    const target = next[event.key];
    if (target !== undefined) {
      event.preventDefault();
      setActiveIndex(target);
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="line-chart"
      role="group"
      tabIndex={0}
      aria-label={`${title}のグラフ。左右の矢印キーで各年の値を読めます。`}
      aria-describedby={descriptionId}
      onKeyDown={handleKey}
      onFocus={() => setActiveIndex((current) => current ?? points.length - 1)}
      onBlur={() => setActiveIndex(null)}
    >
      <svg width={width} height={height} aria-hidden="true">
        {axis.ticks.map((tick, index) => (
          <g key={tick}>
            <line
              className={tick === 0 && axis.min < 0 ? "chart-zero" : "chart-grid"}
              x1={marginLeft}
              x2={marginLeft + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-tick" x={marginLeft - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {tickLabels[index]}
            </text>
          </g>
        ))}

        {xLabelYears.map((year) => (
          <text className="chart-tick" key={year} x={x(year)} y={height - 8} textAnchor="middle">
            {year}
          </text>
        ))}

        {segments.map((segment) =>
          segment.length > 1 ? (
            <g key={segment[0]?.[0]}>
              <polygon
                className="chart-area"
                points={`${x((segment[0] as SeriesPoint)[0])},${baseY} ${segment
                  .map(([year, value]) => `${x(year)},${y(value)}`)
                  .join(" ")} ${x((segment.at(-1) as SeriesPoint)[0])},${baseY}`}
              />
              <polyline
                className="chart-line"
                points={segment.map(([year, value]) => `${x(year)},${y(value)}`).join(" ")}
              />
            </g>
          ) : null
        )}

        {points.map(([year, value], index) =>
          showAllDots || index === points.length - 1 ? (
            <circle
              className="chart-dot"
              key={year}
              cx={x(year)}
              cy={y(value)}
              r={index === points.length - 1 ? 4.5 : 3.5}
            />
          ) : null
        )}

        {active === null && (
          <text className="chart-end-label" x={x(lastPoint[0])} y={y(lastPoint[1]) - 10} textAnchor="end">
            {formatValue(lastPoint[1])}
          </text>
        )}

        {active && (
          <g>
            <line
              className="chart-crosshair"
              x1={x(active[0])}
              x2={x(active[0])}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
            <circle className="chart-dot chart-dot--active" cx={x(active[0])} cy={y(active[1])} r={5.5} />
          </g>
        )}

        <rect
          className="chart-hit"
          x={marginLeft - 10}
          y={0}
          width={plotWidth + 20}
          height={height}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          // タッチでは指を離した時点で leave が来る。そこで消すと、タップした年の値を読めない。
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActiveIndex(null);
          }}
        />
      </svg>

      {active && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(x(active[0]), 60), width - 60),
            top: Math.max(y(active[1]) - 14, 28)
          }}
        >
          <strong>{formatValue(active[1])}</strong>
          <span>{formatYear(active[0], cycle)}</span>
        </div>
      )}

      <p className="visually-hidden" id={descriptionId} aria-live="polite">
        {active
          ? `${formatYear(active[0], cycle)}: ${formatValue(active[1])}`
          : `${formatYear(firstYear, cycle)}から${formatYear(lastYear, cycle)}まで。最新は${formatValue(lastPoint[1])}。`}
      </p>
    </div>
  );
}

/** グラフと同じ値を表で示す(グラフを読めない環境でも値にたどり着けるようにする)。 */
export function SeriesTable({
  title,
  points,
  unit,
  decimals,
  cycle,
  signed = false
}: Pick<LineChartProps, "title" | "points" | "unit" | "decimals" | "cycle" | "signed">) {
  return (
    <details className="series-table">
      <summary>数値を表で見る</summary>
      <ScrollRegion label={`${title}の表`}>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">時点</th>
              <th scope="col" className="is-numeric">
                {unit === "" ? "値" : `値（${unit}）`}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map(([year, value]) => (
              <tr key={year}>
                <th scope="row">{formatYear(year, cycle)}</th>
                <td className="is-numeric">{formatNumber(value, decimals, signed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </details>
  );
}
