/** グラフの目盛り計算。DOMに依存しない純粋関数。 */

/** 1・2・5 × 10^n のうち、range をおよそ targetCount 個に分ける刻み幅を返す。 */
export function niceStep(range: number, targetCount: number): number {
  if (range <= 0 || targetCount <= 0) return 1;
  const rough = range / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export type Axis = { min: number; max: number; ticks: number[]; step: number };

/**
 * 値の範囲を切りのよい目盛りに広げる。
 * 折れ線の変化を読むための軸なので 0 起点にはしないが、正負をまたぐ場合は 0 を目盛りに含める。
 */
export function niceAxis(values: readonly number[], targetCount = 4): Axis {
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    // 値が1種類だけのときは、上下に余白をつくる。
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }

  const step = niceStep(max - min, targetCount);
  const axisMin = Math.floor(min / step) * step;
  const axisMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let index = 0; axisMin + index * step <= axisMax + step / 1e6; index += 1) {
    // 浮動小数の誤差(0.30000000000000004 など)を刻み幅の桁で丸める。
    ticks.push(Number((axisMin + index * step).toPrecision(12)));
  }

  return { min: axisMin, max: axisMax, ticks, step };
}

/**
 * 最大 maxCount 個になるよう、一定の間隔で間引く。
 * 最新の値がいちばん読まれるので、末尾は必ず残して手前へ等間隔にさかのぼる。
 */
export function pickStride<T>(items: readonly T[], maxCount: number): T[] {
  if (items.length <= maxCount || maxCount < 1) return [...items];
  const stride = Math.ceil(items.length / maxCount);
  return items.filter((_, index) => (items.length - 1 - index) % stride === 0);
}
