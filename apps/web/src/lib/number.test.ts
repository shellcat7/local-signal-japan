import { describe, expect, it } from "vitest";
import { csvLine, toCsv } from "./download";
import { parseDecimalInput } from "./number";

describe("parseDecimalInput", () => {
  it("半角・全角の数字、小数、マイナスを読む", () => {
    expect(parseDecimalInput("30")).toBe(30);
    expect(parseDecimalInput(" 30.5 ")).toBe(30.5);
    expect(parseDecimalInput("３０．５")).toBe(30.5);
    expect(parseDecimalInput("−0.25")).toBe(-0.25);
    expect(parseDecimalInput("ー1")).toBe(-1);
    expect(parseDecimalInput("1,175.5")).toBe(1175.5);
  });

  it("空は条件なし、数値でないものは無効として区別する", () => {
    expect(parseDecimalInput("")).toBeUndefined();
    expect(parseDecimalInput("   ")).toBeUndefined();
    expect(parseDecimalInput("-")).toBe("invalid");
    expect(parseDecimalInput("3割")).toBe("invalid");
    expect(parseDecimalInput("1e5")).toBe("invalid");
  });
});

describe("CSV", () => {
  it("区切り文字や引用符を含む値を引用符で囲む", () => {
    expect(csvLine(["府中市", "東京都", 1.5, null])).toBe("府中市,東京都,1.5,");
    expect(csvLine(['a"b', "c,d"])).toBe('"a""b","c,d"');
  });

  it("先頭に BOM を付け、行を CRLF で区切る", () => {
    expect(
      toCsv([
        ["a", 1],
        ["b", 2]
      ])
    ).toBe("\uFEFFa,1\r\nb,2\r\n");
  });
});
