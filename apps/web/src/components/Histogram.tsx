import { histogramBinOf, type Histogram as HistogramData } from "@local-signal-japan/core";

type HistogramProps = {
  histogram: HistogramData;
  /** この市区町村の値。 */
  value: number;
  median: number;
  /** 値を単位つきの文字にする。 */
  format: (value: number) => string;
  label: string;
};

/**
 * 全国の市区町村の分布と、その中でのこの市区町村の位置。
 * 極端な値で形がつぶれないよう、両端の階級には範囲の外側の値もまとめて数えている。
 */
export function Histogram({ histogram, value, median, format, label }: HistogramProps) {
  const peak = Math.max(...histogram.counts, 1);
  const activeBin = histogramBinOf(histogram, value);
  const medianBin = histogramBinOf(histogram, median);
  const bins = histogram.counts.length;
  // 印は階級の中央に置く。範囲の外側の値でも、端の棒の上に乗る。
  const markerLeft = ((activeBin + 0.5) / bins) * 100;
  const medianLeft = ((medianBin + 0.5) / bins) * 100;

  return (
    <div className="histogram" role="img" aria-label={label}>
      <div className="histogram__plot">
        {histogram.counts.map((count, index) => (
          <span
            // 階級は並び順そのものが識別子。
            key={index}
            className={index === activeBin ? "histogram__bar is-active" : "histogram__bar"}
            style={{ height: `${Math.max((count / peak) * 100, count > 0 ? 3 : 0)}%` }}
          />
        ))}
        <span className="histogram__median" style={{ left: `${medianLeft}%` }} />
        <span className="histogram__guide" style={{ left: `${markerLeft}%` }} />
        <span className="histogram__marker" style={{ left: `${markerLeft}%` }} />
      </div>
      <div className="histogram__axis" aria-hidden="true">
        <span>{format(histogram.min)} 以下</span>
        <span>中央値 {format(median)}</span>
        <span>{format(histogram.max)} 以上</span>
      </div>
    </div>
  );
}
