/** 折れ線の先に灯る点。統計の推移と「シグナル」を1つの形にしたマーク。 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect className="logo-mark__tile" width="32" height="32" rx="8" />
      <path
        className="logo-mark__line"
        d="M7 21.5l5.2-5.6 4.4 3.4L24.2 11"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="logo-mark__dot" cx="24.2" cy="11" r="2.7" />
    </svg>
  );
}
