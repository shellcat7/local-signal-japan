/** SVG のパス（M・L・H・V とその小文字、Z）が囲む範囲。小さな町の位置に丸を付けるのに使う。 */
export function pathBounds(d: string): { x: number; y: number; width: number; height: number } | null {
  const tokens = d.match(/[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let command = "M";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const mark = () => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index] as string;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        x = startX;
        y = startY;
      }
      continue;
    }
    const value = Number(token);
    switch (command) {
      case "M":
      case "L": {
        x = value;
        y = Number(tokens[index + 1]);
        index += 2;
        if (command === "M") [startX, startY, command] = [x, y, "L"];
        break;
      }
      case "m":
      case "l": {
        x += value;
        y += Number(tokens[index + 1]);
        index += 2;
        if (command === "m") [startX, startY, command] = [x, y, "l"];
        break;
      }
      case "H":
        x = value;
        index += 1;
        break;
      case "h":
        x += value;
        index += 1;
        break;
      case "V":
        y = value;
        index += 1;
        break;
      case "v":
        y += value;
        index += 1;
        break;
      default:
        index += 1;
    }
    mark();
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}
