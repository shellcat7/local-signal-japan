import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * 要素の幅を追跡する。SVGの文字を拡大縮小させずにレイアウトするために使う。
 * 最初の描画より前に実際の幅を測るので、仮の幅で描いた図が一瞬はみ出すことがない。
 */
export function useElementWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
