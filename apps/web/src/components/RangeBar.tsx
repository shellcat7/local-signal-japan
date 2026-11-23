type RangeBarProps = {
  /** 0〜100。左端が0。 */
  position: number;
  /** 読み上げ用の説明。 */
  label: string;
  /** 0 からの塗りを出すか（補助スコア）、位置の印だけにするか（値の大小での位置）。 */
  variant?: "fill" | "marker";
  tone?: "default" | "night";
};

/**
 * 全国の中での位置を1本の線で示す。中央の目盛りが全国の中央値（50）。
 * 株価の「年初来レンジ」のように、端から端までのどこにいるかを読むための図。
 */
export function RangeBar({ position, label, variant = "marker", tone = "default" }: RangeBarProps) {
  const clamped = Math.max(0, Math.min(100, position));

  return (
    <span className="range-bar" data-variant={variant} data-tone={tone} role="img" aria-label={label}>
      {variant === "fill" && <span className="range-bar__fill" style={{ width: `${clamped}%` }} />}
      <span className="range-bar__median" />
      <span className="range-bar__marker" style={{ left: `${clamped}%` }} />
    </span>
  );
}
