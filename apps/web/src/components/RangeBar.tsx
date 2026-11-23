type RangeBarProps = {
  /** 0〜100。左端が全国で最も小さい側、右端が最も大きい側。 */
  position: number;
  /** 読み上げ用の説明。 */
  label: string;
};

/**
 * 全国の中での位置を、1本の線の上の印で示す。中央の縦線が全国の中央値。
 * 量ではなく位置を示す図なので、端から塗る棒にはしない（塗ると「多いほど良い」と読めてしまう）。
 */
export function RangeBar({ position, label }: RangeBarProps) {
  const clamped = Math.max(0, Math.min(100, position));

  return (
    <span className="range-bar" role="img" aria-label={label}>
      <span className="range-bar__median" />
      <span className="range-bar__marker" style={{ left: `${clamped}%` }} />
    </span>
  );
}
