/**
 * 全国の市区町村の中で、値が小さい側(左)から大きい側(右)のどこにあるかを示す。
 * 目盛りはパーセンタイルなので、中央の線が全国の中央値にあたる。
 */
export function PositionTrack({ position, medianText }: { position: number; medianText: string }) {
  const fromTop = position >= 50;
  const share = Math.max(1, Math.round(fromTop ? 100 - position : position));
  const description = `全国の市区町村で値が${fromTop ? "大きい" : "小さい"}ほうから約${share}%以内。全国の中央値は${medianText}。`;

  return (
    <div className="position-track" role="img" aria-label={description}>
      <div className="position-track__bar">
        <span className="position-track__median" />
        <span className="position-track__marker" style={{ left: `${position}%` }} />
      </div>
      <div className="position-track__labels" aria-hidden="true">
        <span>値が小さい</span>
        <span>全国の中央値 {medianText}</span>
        <span>値が大きい</span>
      </div>
    </div>
  );
}
