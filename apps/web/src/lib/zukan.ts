/**
 * まち図鑑の記録。利用者が「図鑑をはじめる」を押したときだけ、この端末のブラウザ（localStorage）に保存する。
 * 保存するのは引いた市区町村のコードだけで、サーバーには送らない。
 * ブラウザの設定で保存できないときも、画面はそのまま使える（記録が残らないだけ）。
 */

const STORAGE_KEY = "machinomonosashi:zukan:v1";

export type Zukan = {
  /** 図鑑をはじめているか（保存してよいと利用者が選んだか）。 */
  enabled: boolean;
  /** 引いた市区町村のコード（新しい順、重複なし）。 */
  codes: string[];
};

export const EMPTY_ZUKAN: Zukan = { enabled: false, codes: [] };

const isCode = (value: unknown): value is string => typeof value === "string" && /^\d{5}$/.test(value);

export function readZukan(): Zukan {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_ZUKAN;
    const data = JSON.parse(raw) as { codes?: unknown };
    const codes = Array.isArray(data.codes) ? data.codes.filter(isCode) : [];
    return { enabled: true, codes: [...new Set(codes)] };
  } catch {
    return EMPTY_ZUKAN;
  }
}

/** 保存できたら true。 */
export function writeZukan(codes: readonly string[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, codes }));
    return true;
  } catch {
    return false;
  }
}

export function clearZukan(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても、画面の上では記録をやめる。
  }
}

/** 新しく引いたコードを先頭に足す（すでにあれば先頭へ動かす）。 */
export const addCode = (codes: readonly string[], code: string): string[] => [
  code,
  ...codes.filter((item) => item !== code)
];
