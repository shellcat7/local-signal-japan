/** 色の段階の数。珊瑚色の濃さで、値の小さい側から大きい側へ。 */
export const MAP_CLASSES = 7;

/** 珊瑚色の濃淡（薄い → 濃い）。styles.css の --map-0〜6（ライト）と同じ並び。 */
export const MAP_RAMP = ["#fbe9df", "#f6cdb8", "#f0ab8c", "#e58763", "#cc6540", "#a2472a", "#6e2c18"];

/**
 * level は濃淡の段（0 = 最も薄い）。画面では配色に合わせた色（CSS の --map-0〜6）に、
 * 保存する画像では白地用の色（color）に置き換える。
 */
export type MapBin = { min: number; max: number; level: number; color: string };

/**
 * 値を、件数がほぼ同じになる段階（分位）に分ける。
 * 境目の値はその段階に含める。同じ値が境目をまたぐときは、その値を1つの段階にまとめるので、段階が減ることがある。
 */
export function quantileBins(values: readonly number[], classes = MAP_CLASSES): MapBin[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const uppers: number[] = [];
  for (let index = 1; index < classes; index += 1) {
    const upper = sorted[Math.ceil((index * sorted.length) / classes) - 1] as number;
    if (uppers.at(-1) !== upper) uppers.push(upper);
  }
  const max = sorted.at(-1) as number;
  if (uppers.at(-1) !== max) uppers.push(max);

  const ranges: Array<{ min: number; max: number }> = [];
  let start = 0;
  for (const upper of uppers) {
    let end = start;
    while (end < sorted.length && (sorted[end] as number) <= upper) end += 1;
    if (end > start) ranges.push({ min: sorted[start] as number, max: sorted[end - 1] as number });
    start = end;
  }

  // 段階が減った場合も、濃淡は端から端まで使う。
  const last = MAP_RAMP.length - 1;
  return ranges.map((range, index) => {
    const level = ranges.length === 1 ? last : Math.round((index / (ranges.length - 1)) * last);
    return { ...range, level, color: MAP_RAMP[level] as string };
  });
}

/** 値が入る段階。 */
export function binOf(bins: readonly MapBin[], value: number): MapBin | undefined {
  return bins.find((bin) => value <= bin.max) ?? bins.at(-1);
}

/** 値が入る段階の、白地用の色（保存する画像に使う）。 */
export function colorOf(bins: readonly MapBin[], value: number): string | undefined {
  return binOf(bins, value)?.color;
}
