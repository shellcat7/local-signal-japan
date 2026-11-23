import { describe, expect, it } from "vitest";
import { formatHash, parseHash } from "./route";

describe("parseHash", () => {
  it("市区町村コードとタブを読む", () => {
    expect(parseHash("#area=13101&tab=indicators")).toEqual({ areaCode: "13101", tab: "indicators" });
  });

  it("タブの指定がなければ概要にする", () => {
    expect(parseHash("#area=16210")).toEqual({ areaCode: "16210", tab: "overview" });
  });

  it("不正な値は無視する", () => {
    expect(parseHash("")).toEqual({ areaCode: null, tab: "overview" });
    expect(parseHash("#area=abc&tab=unknown")).toEqual({ areaCode: null, tab: "overview" });
    expect(parseHash("#area=131011")).toEqual({ areaCode: null, tab: "overview" });
  });
});

describe("formatHash", () => {
  it("概要タブは省略して短くする", () => {
    expect(formatHash({ areaCode: "13101", tab: "overview" })).toBe("#area=13101");
    expect(formatHash({ areaCode: "13101", tab: "report" })).toBe("#area=13101&tab=report");
  });

  it("市区町村が未選択ならハッシュを付けない", () => {
    expect(formatHash({ areaCode: null, tab: "comparison" })).toBe("");
  });

  it("parseHash と往復できる", () => {
    const route = { areaCode: "14117", tab: "comparison" } as const;
    expect(parseHash(formatHash(route))).toEqual(route);
  });
});
