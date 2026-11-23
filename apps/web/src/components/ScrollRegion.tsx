import type { ReactNode } from "react";

/**
 * 横に長い表を、ページ全体ではなくこの枠の中でスクロールさせる。
 * キーボードでもスクロールできるよう、枠自体にフォーカスを当てられるようにしている。
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
