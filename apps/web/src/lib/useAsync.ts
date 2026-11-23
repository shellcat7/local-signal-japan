import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  { status: "loading"; previous?: T } | { status: "ready"; value: T } | { status: "error"; message: string };

type Settled<T> = { load: unknown; attempt: number; state: Exclude<AsyncState<T>, { status: "loading" }> };

/**
 * load が変わるたびに呼び直す非同期読み込み。
 * 読み込み中は直前の結果を previous として返すので、画面を保ったまま切り替えられる。
 * load は useCallback で安定させて渡すこと。
 */
export function useAsync<T>(load: () => Promise<T>): [AsyncState<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let cancelled = false;

    load().then(
      (value) => {
        if (!cancelled) setSettled({ load, attempt, state: { status: "ready", value } });
      },
      (error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "読み込みに失敗しました。";
          setSettled({ load, attempt, state: { status: "error", message } });
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  if (settled && settled.load === load && settled.attempt === attempt) {
    return [settled.state, retry];
  }

  const previous = settled?.state.status === "ready" ? settled.state.value : undefined;
  return [previous === undefined ? { status: "loading" } : { status: "loading", previous }, retry];
}
