/** ブラウザの中で作ったデータを、ファイルとして保存する。どこにも送信しない。 */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // 保存が始まる前に取り消さないよう、少し待ってから解放する。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(filename: string, content: string, mimeType: string) {
  downloadBlob(filename, new Blob([content], { type: `${mimeType};charset=utf-8` }));
}

/** 表計算ソフトで開ける CSV の1行。値に「,」や改行、引用符があれば引用符で囲む。 */
export function csvLine(cells: ReadonlyArray<string | number | null>): string {
  return cells
    .map((cell) => {
      const text = cell === null ? "" : String(cell);
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

/** Excel が文字化けせずに開けるよう、先頭に BOM を付ける。 */
export function toCsv(lines: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return `\uFEFF${lines.map(csvLine).join("\r\n")}\r\n`;
}
