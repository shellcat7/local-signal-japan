/**
 * 条件の入力欄に入れた文字を数値にする。
 * 日本語入力のままでも打てるよう、全角の数字・小数点・マイナスを受け付ける。
 * 空なら undefined（条件なし）、数値として読めなければ "invalid"。
 */
export function parseDecimalInput(text: string): number | undefined | "invalid" {
  const normalized = text
    .normalize("NFKC")
    .replace(/[\u2212\u30fc\uff70\u2010-\u2015]/g, "-")
    .replace(/[,\s]/g, "");
  if (normalized === "") return undefined;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return "invalid";
  const value = Number(normalized);
  return Number.isFinite(value) ? value : "invalid";
}
